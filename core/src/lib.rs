use wasm_bindgen::prelude::*;

pub mod ansi;
pub mod chrome;
pub mod doc;
pub mod font;
pub mod image;
pub mod layout;
pub mod name;
pub mod project;
pub mod raw;
pub mod role;
pub mod screen;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
