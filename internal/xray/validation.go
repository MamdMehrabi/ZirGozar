package xray

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

const maxConfigFileSize = 4 << 20

// ValidateConfigFile checks that a local Xray JSON config is structurally valid
// and accepted by the selected Xray core without starting a proxy process.
func ValidateConfigFile(binaryPath, configPath string) error {
	if binaryPath == "" {
		return ErrInvalidExecutable
	}
	if _, err := os.Stat(binaryPath); err != nil {
		return fmt.Errorf("%w: Xray executable is unavailable", ErrInvalidExecutable)
	}
	file, err := os.Open(configPath)
	if err != nil {
		return fmt.Errorf("%w: cannot open selected file", ErrInvalidConfig)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("%w: selected path is not a regular file", ErrInvalidConfig)
	}
	if info.Size() > maxConfigFileSize {
		return fmt.Errorf("%w: configuration exceeds 4 MiB", ErrInvalidConfig)
	}
	content, err := io.ReadAll(io.LimitReader(file, maxConfigFileSize+1))
	if err != nil {
		return fmt.Errorf("%w: cannot read selected file", ErrInvalidConfig)
	}
	if len(content) > maxConfigFileSize {
		return fmt.Errorf("%w: configuration exceeds 4 MiB", ErrInvalidConfig)
	}
	var config map[string]json.RawMessage
	if !json.Valid(content) || json.Unmarshal(content, &config) != nil || config == nil {
		return fmt.Errorf("%w: file must contain one Xray JSON object", ErrInvalidConfig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, binaryPath, "run", "-test", "-c", configPath)
	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("%w: Xray validation timed out", ErrInvalidConfig)
		}
		return fmt.Errorf("%w: Xray core rejected the configuration; check its fields and compatibility", ErrInvalidConfig)
	}
	return nil
}
