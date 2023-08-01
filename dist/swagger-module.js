"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwaggerModule = void 0;
const jsyaml = require("js-yaml");
const metadata_loader_1 = require("./plugin/metadata-loader");
const swagger_scanner_1 = require("./swagger-scanner");
const swagger_ui_1 = require("./swagger-ui");
const assign_two_levels_deep_1 = require("./utils/assign-two-levels-deep");
const get_global_prefix_1 = require("./utils/get-global-prefix");
const normalize_rel_path_1 = require("./utils/normalize-rel-path");
const validate_global_prefix_util_1 = require("./utils/validate-global-prefix.util");
const validate_path_util_1 = require("./utils/validate-path.util");
class SwaggerModule {
    static createDocument(app, config, options = {}) {
        const swaggerScanner = new swagger_scanner_1.SwaggerScanner();
        const document = swaggerScanner.scanApplication(app, options);
        document.components = (0, assign_two_levels_deep_1.assignTwoLevelsDeep)({}, config.components, document.components);
        return {
            openapi: '3.0.0',
            paths: {},
            ...config,
            ...document
        };
    }
    static async loadPluginMetadata(metadataFn) {
        const metadata = await metadataFn();
        return this.metadataLoader.load(metadata);
    }
    static serveStatic(finalPath, app) {
        const httpAdapter = app.getHttpAdapter();
        const swaggerAssetsAbsoluteFSPath = (0, swagger_ui_1.getSwaggerAssetsAbsoluteFSPath)();
        if (httpAdapter && httpAdapter.getType() === 'fastify') {
            app.useStaticAssets({
                root: swaggerAssetsAbsoluteFSPath,
                prefix: finalPath,
                decorateReply: false
            });
        }
        else {
            app.useStaticAssets(swaggerAssetsAbsoluteFSPath, { prefix: finalPath });
        }
    }
    static serveDocuments(finalPath, urlLastSubdirectory, httpAdapter, documentOrFactory, options) {
        let document;
        const lazyBuildDocument = () => {
            return typeof documentOrFactory === 'function'
                ? documentOrFactory()
                : documentOrFactory;
        };
        const baseUrlForSwaggerUI = (0, normalize_rel_path_1.normalizeRelPath)(`./${urlLastSubdirectory}/`);
        let html;
        let swaggerInitJS;
        httpAdapter.get((0, normalize_rel_path_1.normalizeRelPath)(`${finalPath}/swagger-ui-init.js`), (req, res) => {
            res.type('application/javascript');
            if (!document) {
                document = lazyBuildDocument();
                if (options.swaggerOptions.patchDocumentOnRequest) {
                    document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                }
            }
            if (!swaggerInitJS) {
                swaggerInitJS = (0, swagger_ui_1.buildSwaggerInitJS)(document, options.swaggerOptions);
            }
            res.send(swaggerInitJS);
        });
        try {
            httpAdapter.get((0, normalize_rel_path_1.normalizeRelPath)(`${finalPath}/${urlLastSubdirectory}/swagger-ui-init.js`), (req, res) => {
                res.type('application/javascript');
                if (!document) {
                    document = lazyBuildDocument();
                    if (options.swaggerOptions.patchDocumentOnRequest) {
                        document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                    }
                }
                if (!swaggerInitJS) {
                    swaggerInitJS = (0, swagger_ui_1.buildSwaggerInitJS)(document, options.swaggerOptions);
                }
                res.send(swaggerInitJS);
            });
        }
        catch (err) {
        }
        httpAdapter.get(finalPath, (req, res) => {
            res.type('text/html');
            if (!document) {
                document = lazyBuildDocument();
                if (options.swaggerOptions.patchDocumentOnRequest) {
                    document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                }
            }
            if (!html) {
                html = (0, swagger_ui_1.buildSwaggerHTML)(baseUrlForSwaggerUI, document, options.swaggerOptions);
            }
            res.send(html);
        });
        try {
            httpAdapter.get((0, normalize_rel_path_1.normalizeRelPath)(`${finalPath}/`), (req, res) => {
                res.type('text/html');
                if (!document) {
                    document = lazyBuildDocument();
                    if (options.swaggerOptions.patchDocumentOnRequest) {
                        document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                    }
                }
                if (!html) {
                    html = (0, swagger_ui_1.buildSwaggerHTML)(baseUrlForSwaggerUI, document, options.swaggerOptions);
                }
                res.send(html);
            });
        }
        catch (err) {
        }
        let yamlDocument;
        let jsonDocument;
        httpAdapter.get((0, normalize_rel_path_1.normalizeRelPath)(options.jsonDocumentUrl), (req, res) => {
            res.type('application/json');
            if (!document) {
                document = lazyBuildDocument();
                if (options.swaggerOptions.patchDocumentOnRequest) {
                    document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                }
            }
            if (!jsonDocument) {
                jsonDocument = JSON.stringify(document);
            }
            res.send(jsonDocument);
        });
        httpAdapter.get((0, normalize_rel_path_1.normalizeRelPath)(options.yamlDocumentUrl), (req, res) => {
            res.type('text/yaml');
            if (!document) {
                document = lazyBuildDocument();
                if (options.swaggerOptions.patchDocumentOnRequest) {
                    document = options.swaggerOptions.patchDocumentOnRequest(req, res, document);
                }
            }
            if (!yamlDocument) {
                yamlDocument = jsyaml.dump(document, { skipInvalid: true });
            }
            res.send(yamlDocument);
        });
    }
    static setup(path, app, documentOrFactory, options) {
        const globalPrefix = (0, get_global_prefix_1.getGlobalPrefix)(app);
        const finalPath = (0, validate_path_util_1.validatePath)(options?.useGlobalPrefix && (0, validate_global_prefix_util_1.validateGlobalPrefix)(globalPrefix)
            ? `${globalPrefix}${(0, validate_path_util_1.validatePath)(path)}`
            : path);
        const urlLastSubdirectory = finalPath.split('/').slice(-1).pop() || '';
        const validatedGlobalPrefix = options?.useGlobalPrefix && (0, validate_global_prefix_util_1.validateGlobalPrefix)(globalPrefix)
            ? (0, validate_path_util_1.validatePath)(globalPrefix)
            : '';
        const finalJSONDocumentPath = options?.jsonDocumentUrl
            ? `${validatedGlobalPrefix}${(0, validate_path_util_1.validatePath)(options.jsonDocumentUrl)}`
            : `${finalPath}-json`;
        const finalYAMLDocumentPath = options?.yamlDocumentUrl
            ? `${validatedGlobalPrefix}${(0, validate_path_util_1.validatePath)(options.yamlDocumentUrl)}`
            : `${finalPath}-yaml`;
        const httpAdapter = app.getHttpAdapter();
        SwaggerModule.serveDocuments(finalPath, urlLastSubdirectory, httpAdapter, documentOrFactory, {
            jsonDocumentUrl: finalJSONDocumentPath,
            yamlDocumentUrl: finalYAMLDocumentPath,
            swaggerOptions: options || {}
        });
        SwaggerModule.serveStatic(finalPath, app);
        const serveStaticSlashEndingPath = `${finalPath}/${urlLastSubdirectory}`;
        if (serveStaticSlashEndingPath !== finalPath) {
            SwaggerModule.serveStatic(serveStaticSlashEndingPath, app);
        }
    }
}
exports.SwaggerModule = SwaggerModule;
SwaggerModule.metadataLoader = new metadata_loader_1.MetadataLoader();
