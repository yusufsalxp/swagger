"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MimetypeContentWrapper = void 0;
class MimetypeContentWrapper {
    wrap(mimetype, obj) {
        const content = mimetype.reduce((acc, item) => ({ ...acc, [item]: obj }), {});
        return { content };
    }
}
exports.MimetypeContentWrapper = MimetypeContentWrapper;
