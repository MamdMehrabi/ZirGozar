package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:         "ZirGozar",
		Width:         920,
		Height:        760,
		MinWidth:      800,
		MinHeight:     680,
		DisableResize: false,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Linux: &linux.Options{
			Icon:             appIcon,
			ProgramName:      "zirgozar",
			WebviewGpuPolicy: linux.WebviewGpuPolicyNever,
		},
		BackgroundColour: &options.RGBA{R: 11, G: 20, B: 33, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		panic(err)
	}
}
