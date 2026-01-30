export var ComponentType;
(function (ComponentType) {
    ComponentType[ComponentType["ActionRow"] = 1] = "ActionRow";
    ComponentType[ComponentType["Button"] = 2] = "Button";
    ComponentType[ComponentType["Section"] = 9] = "Section";
    ComponentType[ComponentType["TextDisplay"] = 10] = "TextDisplay";
    ComponentType[ComponentType["Thumbnail"] = 11] = "Thumbnail";
    ComponentType[ComponentType["MediaGallery"] = 12] = "MediaGallery";
    ComponentType[ComponentType["File"] = 13] = "File";
    ComponentType[ComponentType["Separator"] = 14] = "Separator";
    ComponentType[ComponentType["Container"] = 17] = "Container";
})(ComponentType || (ComponentType = {}));
export const COMPONENTS_V2_FLAG = 1 << 15; // 32768
