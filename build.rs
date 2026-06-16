use std::{env, fs, path::Path, process::Command, time::SystemTime};

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=PROFILE");
    println!("cargo:rerun-if-env-changed=SKIP_FRONTEND_BUILD");

    for path in [
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/index.html",
        "frontend/vite.config.ts",
        "frontend/tailwind.config.js",
        "frontend/tsconfig.json",
        "frontend/tsconfig.app.json",
        "frontend/tsconfig.node.json",
        "frontend/public",
        "frontend/src",
        "frontend/dist/index.html",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }

    let profile = env::var("PROFILE").unwrap_or_else(|_| String::from("debug"));

    if env::var_os("SKIP_FRONTEND_BUILD").is_some() {
        println!("cargo:warning=Skipping frontend build because SKIP_FRONTEND_BUILD is set.");
        return;
    }

    if profile != "release" {
        println!(
            "cargo:warning=Skipping frontend build for `{profile}` profile. Run `npm run dev` inside `frontend/` for hot reload."
        );
        return;
    }

    let frontend_dir = Path::new("frontend");
    assert!(
        frontend_dir.exists(),
        "frontend directory not found at {}",
        frontend_dir.display()
    );

    println!("cargo:warning=Preparing frontend release build...");

    if npm_install_needed(frontend_dir) {
        install_frontend_dependencies(frontend_dir);
    } else {
        println!("cargo:warning=Using existing frontend dependencies.");
    }

    if frontend_build_needed(frontend_dir) {
        println!("cargo:warning=Running frontend production build...");
        run_npm(frontend_dir, &["run", "build"]);
    } else {
        println!(
            "cargo:warning=Skipping frontend production build; `frontend/dist` is up to date."
        );
    }
}

fn npm_install_needed(frontend_dir: &Path) -> bool {
    let node_modules = frontend_dir.join("node_modules");
    if !node_modules.exists() {
        return true;
    }

    let node_modules_modified = modified_time(&node_modules);

    [
        frontend_dir.join("package.json"),
        frontend_dir.join("package-lock.json"),
    ]
    .into_iter()
    .filter(|path| path.exists())
    .any(|path| match (modified_time(&path), node_modules_modified) {
        (Some(input_modified), Some(node_modules_modified)) => {
            input_modified > node_modules_modified
        }
        _ => true,
    })
}

fn frontend_build_needed(frontend_dir: &Path) -> bool {
    let dist_index = frontend_dir.join("dist").join("index.html");
    if !dist_index.is_file() {
        return true;
    }

    let dist_modified = modified_time(&dist_index);
    let latest_input_modified = latest_frontend_input_time(frontend_dir);

    match (latest_input_modified, dist_modified) {
        (Some(input_modified), Some(dist_modified)) => input_modified > dist_modified,
        _ => true,
    }
}

fn latest_frontend_input_time(frontend_dir: &Path) -> Option<SystemTime> {
    [
        frontend_dir.join("src"),
        frontend_dir.join("public"),
        frontend_dir.join("index.html"),
        frontend_dir.join("package.json"),
        frontend_dir.join("package-lock.json"),
        frontend_dir.join("vite.config.ts"),
        frontend_dir.join("tailwind.config.js"),
        frontend_dir.join("tsconfig.json"),
        frontend_dir.join("tsconfig.app.json"),
        frontend_dir.join("tsconfig.node.json"),
    ]
    .into_iter()
    .filter(|path| path.exists())
    .filter_map(|path| latest_modified_in_path(&path))
    .max()
}

fn latest_modified_in_path(path: &Path) -> Option<SystemTime> {
    let metadata = fs::metadata(path).ok()?;
    let mut latest = metadata.modified().ok()?;

    if metadata.is_dir() {
        let entries = fs::read_dir(path).ok()?;
        for entry in entries {
            let entry = entry.ok()?;
            if let Some(child_modified) = latest_modified_in_path(&entry.path()) {
                if child_modified > latest {
                    latest = child_modified;
                }
            }
        }
    }

    Some(latest)
}

fn install_frontend_dependencies(frontend_dir: &Path) {
    if frontend_dir.join("package-lock.json").is_file() {
        println!("cargo:warning=Installing frontend dependencies with `npm ci`...");
        run_npm(frontend_dir, &["ci"]);
    } else {
        println!("cargo:warning=Installing frontend dependencies with `npm install`...");
        run_npm(frontend_dir, &["install"]);
    }
}

fn modified_time(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).ok()?.modified().ok()
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
