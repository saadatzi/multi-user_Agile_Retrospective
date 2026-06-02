use std::env;
use std::path::Path;
use std::process::Command;

fn main() {
    for path in [
        "frontend/index.html",
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/vite.config.ts",
        "frontend/tsconfig.json",
        "frontend/tsconfig.app.json",
        "frontend/tailwind.config.js",
        "frontend/eslint.config.js",
        "frontend/public",
        "frontend/src",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }

    let frontend_dir = Path::new("frontend");
    let dist_dir = frontend_dir.join("dist");

    // If a Vite dev server is running and set via env var, normally we skip building
    // the frontend so developers can use HMR. However, if the `frontend/dist` output
    // doesn't exist (for example on a fresh clone), build it so `cargo run` still
    // produces a working embedded binary.
    if env::var_os("VITE_DEV_SERVER").is_some() {
        if dist_dir.exists() {
            println!("cargo:warning=VITE_DEV_SERVER is set, skipping frontend build (dev mode).");
            return;
        } else {
            println!("cargo:warning=VITE_DEV_SERVER is set but frontend/dist not found — building frontend so embedded assets are available.");
            // fall through and build
        }
    }

    if env::var_os("SKIP_FRONTEND_BUILD").is_some() {
        if dist_dir.exists() {
            println!("cargo:warning=Skipping frontend build because SKIP_FRONTEND_BUILD is set.");
            return;
        }

        panic!(
            "SKIP_FRONTEND_BUILD is set but frontend/dist does not exist. Run `npm run build` in `frontend` first."
        );
    }

    if !frontend_dir.join("node_modules").exists() {
        run_npm(frontend_dir, &["ci"]);
    }

    run_npm(frontend_dir, &["run", "build"]);
}

fn run_npm(frontend_dir: &Path, args: &[&str]) {
    let npm = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    let status = Command::new(npm)
        .args(args)
        .current_dir(frontend_dir)
        .status()
        .unwrap_or_else(|error| panic!("failed to run {npm} {}: {error}", args.join(" ")));

    if !status.success() {
        panic!("{npm} {} failed with status {status}", args.join(" "));
    }
}
