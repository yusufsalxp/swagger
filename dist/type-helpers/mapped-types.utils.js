"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inheritAutoMapMetadata = exports.clonePluginMetadataFactory = void 0;
const lodash_1 = require("lodash");
const plugin_constants_1 = require("../plugin/plugin-constants");
const core_1 = require("@automapper/core");
const classes_1 = require("@automapper/classes");
function clonePluginMetadataFactory(target, parent, transformFn = lodash_1.identity) {
    let targetMetadata = {};
    do {
        if (!parent.constructor) {
            return;
        }
        if (!parent.constructor[plugin_constants_1.METADATA_FACTORY_NAME]) {
            continue;
        }
        const parentMetadata = parent.constructor[plugin_constants_1.METADATA_FACTORY_NAME]();
        targetMetadata = {
            ...parentMetadata,
            ...targetMetadata
        };
    } while ((parent = Reflect.getPrototypeOf(parent)) &&
        parent !== Object.prototype &&
        parent);
    targetMetadata = transformFn(targetMetadata);
    if (target[plugin_constants_1.METADATA_FACTORY_NAME]) {
        const originalFactory = target[plugin_constants_1.METADATA_FACTORY_NAME];
        target[plugin_constants_1.METADATA_FACTORY_NAME] = () => {
            const originalMetadata = originalFactory();
            return {
                ...originalMetadata,
                ...targetMetadata
            };
        };
    }
    else {
        target[plugin_constants_1.METADATA_FACTORY_NAME] = () => targetMetadata;
    }
}
exports.clonePluginMetadataFactory = clonePluginMetadataFactory;
function inheritAutoMapMetadata(parentClass, targetClass, isPropertyInherited = () => true) {
    try {
        const [parentClassMetadataList] = (0, classes_1.getMetadataList)(parentClass);
        if (!parentClassMetadataList.length) {
            return;
        }
        const [existingMetadataList] = (0, classes_1.getMetadataList)(targetClass);
        Reflect.defineMetadata(classes_1.AUTOMAP_PROPERTIES_METADATA_KEY, [
            ...existingMetadataList,
            ...parentClassMetadataList.filter(([propertyKey]) => isPropertyInherited(propertyKey))
        ], targetClass);
    }
    catch (e) {
        if (core_1.AutoMapperLogger.error) {
            core_1.AutoMapperLogger.error(`Error trying to inherit metadata: ${e}`);
        }
    }
}
exports.inheritAutoMapMetadata = inheritAutoMapMetadata;
