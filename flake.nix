{
  description = "Sloppy — a Godot 4 rhythm game (DDR × Guitar Hero) with Rust gameplay logic, exported to Android and Web";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
          config.allowUnfree = true; # Android SDK/NDK licenses
        };

        # Rust toolchain with the targets needed for Web (wasm) and Android.
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          targets = [
            "wasm32-unknown-emscripten"
            "aarch64-linux-android"
            "armv7-linux-androideabi"
            "x86_64-linux-android"
          ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "sloppy-dev";

          buildInputs = with pkgs; [
            # Engine
            godot_4

            # Rust + godot-rust (gdext) build deps
            rustToolchain
            cargo-watch
            clang
            llvmPackages.libclang
            pkg-config

            # Web export
            emscripten

            # Android export (SDK/NDK + JDK for the export templates)
            android-tools
            jdk17
          ];

          # gdext / bindgen needs to find libclang.
          LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";

          shellHook = ''
            echo "sloppy dev shell — godot $(godot --version 2>/dev/null | head -n1), $(rustc --version)"
            echo "Build Rust:   cargo build --manifest-path rust/Cargo.toml"
            echo "Run (headless): godot --headless --path . "
          '';
        };
      });
}
