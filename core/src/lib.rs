use wasm_bindgen::prelude::*;

pub mod doc;
pub mod raw;
pub mod screen;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
