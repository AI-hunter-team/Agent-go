export const previewWorldVersion=():"metro-v1"|"metro-v2"=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("worldgen")==="v2"?"metro-v2":"metro-v1";
