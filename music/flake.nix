{
  description = "Sloppy music sketches — Strudel live-coding (https://strudel.cc)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        port = "8090";

        # Serves the local player (index.html + *.strudel). Uses the current
        # directory when it holds the player, so live edits show up on reload;
        # otherwise falls back to the copy in the Nix store.
        serve = pkgs.writeShellApplication {
          name = "strudel-serve";
          runtimeInputs = [ pkgs.python3 ];
          text = ''
            dir="''${STRUDEL_DIR:-$PWD}"
            [ -f "$dir/index.html" ] || dir="${self}"
            echo "Strudel player → http://localhost:${port}/  (serving $dir)"
            exec python3 -m http.server ${port} --bind 127.0.0.1 --directory "$dir"
          '';
        };

        # Runs the full upstream Strudel REPL locally (clones it on first run).
        repl = pkgs.writeShellApplication {
          name = "strudel-repl";
          runtimeInputs = [ pkgs.git pkgs.nodejs_22 pkgs.pnpm ];
          text = ''
            src="''${STRUDEL_SRC:-''${XDG_CACHE_HOME:-$HOME/.cache}/strudel}"
            if [ ! -d "$src/.git" ]; then
              git clone --depth 1 https://codeberg.org/uzu/strudel.git "$src"
            fi
            cd "$src"
            pnpm install
            exec pnpm dev
          '';
        };
      in
      {
        packages = { inherit serve repl; default = serve; };

        apps = {
          default = { type = "app"; program = "${serve}/bin/strudel-serve"; };
          repl = { type = "app"; program = "${repl}/bin/strudel-repl"; };
        };

        devShells.default = pkgs.mkShell {
          name = "strudel";
          packages = [ serve repl pkgs.nodejs_22 pkgs.pnpm pkgs.python3 ];
          shellHook = ''
            echo "strudel shell — strudel-serve (local player) | strudel-repl (full REPL)"
          '';
        };
      });
}
