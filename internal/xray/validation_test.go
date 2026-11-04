package xray

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestValidateConfigFile(t *testing.T) {
	dir := t.TempDir()
	binaryPath := filepath.Join(dir, "xray")
	configPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\n[ \"$1\" = run ] && [ \"$2\" = -test ]\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte(`{"inbounds":[],"outbounds":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateConfigFile(binaryPath, configPath); err != nil {
		t.Fatalf("ValidateConfigFile() error = %v", err)
	}
}

func TestValidateConfigFileRejectsInvalidInputs(t *testing.T) {
	dir := t.TempDir()
	binaryPath := filepath.Join(dir, "xray")
	configPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\nexit 1\n"), 0o700); err != nil {
		t.Fatal(err)
	}

	for _, content := range []string{"", `[]`, `{invalid}`, `{} {}`} {
		if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := ValidateConfigFile(binaryPath, configPath); !errors.Is(err, ErrInvalidConfig) {
			t.Errorf("ValidateConfigFile(%q) error = %v, want ErrInvalidConfig", content, err)
		}
	}

	if err := ValidateConfigFile(binaryPath, filepath.Join(dir, "missing.json")); !errors.Is(err, ErrInvalidConfig) {
		t.Errorf("ValidateConfigFile(missing) error = %v, want ErrInvalidConfig", err)
	}
	if err := ValidateConfigFile("", configPath); !errors.Is(err, ErrInvalidExecutable) {
		t.Errorf("ValidateConfigFile(empty binary) error = %v, want ErrInvalidExecutable", err)
	}
}
