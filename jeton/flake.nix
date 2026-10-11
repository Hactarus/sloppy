{
  description = "Jeton dev shell: Node 22 + pnpm + PostgreSQL 16 (server); Android tooling is optional (see comments)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            postgresql_16
            # --- optional: Capacitor Android build of the PWA (jeton/app) ---
            # jdk17
            # androidenv.androidPkgs.androidsdk   # or install the SDK with Android Studio; set ANDROID_HOME
            # gradle
          ];
          shellHook = ''
            echo "jeton dev shell: node $(node -v), pnpm $(pnpm -v), $(postgres --version)"
            echo "  tests start their own scratch PostgreSQL cluster (or set TEST_DATABASE_URL_OWNER)"
            echo "  cd server && pnpm install && pnpm typecheck && pnpm test"
          '';
        };
      });
}
