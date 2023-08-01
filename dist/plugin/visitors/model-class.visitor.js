"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelClassVisitor = void 0;
const lodash_1 = require("lodash");
const path_1 = require("path");
const ts = require("typescript");
const typescript_1 = require("typescript");
const decorators_1 = require("../../decorators");
const plugin_constants_1 = require("../plugin-constants");
const plugin_debug_logger_1 = require("../plugin-debug-logger");
const ast_utils_1 = require("../utils/ast-utils");
const plugin_utils_1 = require("../utils/plugin-utils");
const type_reference_to_identifier_util_1 = require("../utils/type-reference-to-identifier.util");
const abstract_visitor_1 = require("./abstract.visitor");
class ModelClassVisitor extends abstract_visitor_1.AbstractFileVisitor {
    constructor() {
        super(...arguments);
        this._typeImports = {};
        this._collectedMetadata = {};
    }
    get typeImports() {
        return this._typeImports;
    }
    get collectedMetadata() {
        const metadataWithImports = [];
        Object.keys(this._collectedMetadata).forEach((filePath) => {
            const metadata = this._collectedMetadata[filePath];
            const path = filePath.replace(/\.[jt]s$/, '');
            const importExpr = ts.factory.createCallExpression(ts.factory.createToken(ts.SyntaxKind.ImportKeyword), undefined, [ts.factory.createStringLiteral(path)]);
            metadataWithImports.push([importExpr, metadata]);
        });
        return metadataWithImports;
    }
    visit(sourceFile, ctx, program, options) {
        const typeChecker = program.getTypeChecker();
        sourceFile = this.updateImports(sourceFile, ctx.factory, program);
        const propertyNodeVisitorFactory = (metadata) => (node) => {
            const visit = () => {
                if (ts.isPropertyDeclaration(node)) {
                    this.visitPropertyNodeDeclaration(node, ctx, typeChecker, options, sourceFile, metadata);
                }
                return node;
            };
            const visitedNode = visit();
            if (!options.readonly) {
                return visitedNode;
            }
        };
        const visitClassNode = (node) => {
            if (ts.isClassDeclaration(node)) {
                const metadata = {};
                const isExported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
                if (options.readonly) {
                    if (isExported) {
                        ts.forEachChild(node, propertyNodeVisitorFactory(metadata));
                    }
                    else {
                        if (options.debug) {
                            plugin_debug_logger_1.pluginDebugLogger.debug(`Skipping class "${node.name.getText()}" because it's not exported.`);
                        }
                    }
                }
                else {
                    node = ts.visitEachChild(node, propertyNodeVisitorFactory(metadata), ctx);
                }
                if ((isExported && options.readonly) || !options.readonly) {
                    const declaration = this.addMetadataFactory(ctx.factory, node, metadata, sourceFile, options);
                    if (!options.readonly) {
                        return declaration;
                    }
                }
            }
            if (options.readonly) {
                ts.forEachChild(node, visitClassNode);
            }
            else {
                return ts.visitEachChild(node, visitClassNode, ctx);
            }
        };
        return ts.visitNode(sourceFile, visitClassNode);
    }
    visitPropertyNodeDeclaration(node, ctx, typeChecker, options, sourceFile, metadata) {
        const decorators = ts.canHaveDecorators(node) && ts.getDecorators(node);
        const hidePropertyDecorator = (0, plugin_utils_1.getDecoratorOrUndefinedByNames)([decorators_1.ApiHideProperty.name], decorators, typescript_1.factory);
        if (hidePropertyDecorator) {
            return node;
        }
        const isPropertyStatic = (node.modifiers || []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
        if (isPropertyStatic) {
            return node;
        }
        try {
            this.inspectPropertyDeclaration(ctx.factory, node, typeChecker, options, sourceFile.fileName, sourceFile, metadata);
        }
        catch (err) {
            return node;
        }
    }
    addMetadataFactory(factory, node, classMetadata, sourceFile, options) {
        const returnValue = factory.createObjectLiteralExpression(Object.keys(classMetadata).map((key) => factory.createPropertyAssignment(factory.createIdentifier(key), classMetadata[key])));
        if (options.readonly) {
            const filePath = this.normalizeImportPath(options.pathToSource, sourceFile.fileName);
            if (!this._collectedMetadata[filePath]) {
                this._collectedMetadata[filePath] = {};
            }
            const attributeKey = node.name.getText();
            this._collectedMetadata[filePath][attributeKey] = returnValue;
            return;
        }
        const method = factory.createMethodDeclaration([factory.createModifier(ts.SyntaxKind.StaticKeyword)], undefined, factory.createIdentifier(plugin_constants_1.METADATA_FACTORY_NAME), undefined, undefined, [], undefined, factory.createBlock([factory.createReturnStatement(returnValue)], true));
        return factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, [...node.members, method]);
    }
    inspectPropertyDeclaration(factory, compilerNode, typeChecker, options, hostFilename, sourceFile, metadata) {
        const objectLiteralExpr = this.createDecoratorObjectLiteralExpr(factory, compilerNode, typeChecker, factory.createNodeArray(), options, hostFilename, sourceFile);
        this.addClassMetadata(compilerNode, objectLiteralExpr, sourceFile, metadata);
    }
    createDecoratorObjectLiteralExpr(factory, node, typeChecker, existingProperties = factory.createNodeArray(), options = {}, hostFilename = '', sourceFile) {
        const isRequired = !node.questionToken;
        const properties = [
            ...existingProperties,
            !(0, plugin_utils_1.hasPropertyKey)('required', existingProperties) &&
                factory.createPropertyAssignment('required', (0, ast_utils_1.createBooleanLiteral)(factory, isRequired)),
            ...this.createTypePropertyAssignments(factory, node.type, typeChecker, existingProperties, hostFilename, options),
            ...this.createDescriptionAndTsDocTagPropertyAssigments(factory, node, typeChecker, existingProperties, options, sourceFile),
            this.createDefaultPropertyAssignment(factory, node, existingProperties, options),
            this.createEnumPropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options)
        ];
        if (options.classValidatorShim) {
            properties.push(this.createValidationPropertyAssignments(factory, node, options));
        }
        return factory.createObjectLiteralExpression((0, lodash_1.compact)((0, lodash_1.flatten)(properties)));
    }
    createTypePropertyAssignments(factory, node, typeChecker, existingProperties, hostFilename, options) {
        const key = 'type';
        if ((0, plugin_utils_1.hasPropertyKey)(key, existingProperties)) {
            return [];
        }
        if (node) {
            if (ts.isTypeLiteralNode(node)) {
                const initializer = this.createInitializerForTypeLiteralNode(node, factory, typeChecker, existingProperties, hostFilename, options);
                return [factory.createPropertyAssignment(key, initializer)];
            }
            else if (ts.isUnionTypeNode(node)) {
                const { nullableType, isNullable } = this.isNullableUnion(node);
                const remainingTypes = node.types.filter((item) => item !== nullableType);
                if (remainingTypes.length === 1) {
                    const propertyAssignments = this.createTypePropertyAssignments(factory, remainingTypes[0], typeChecker, existingProperties, hostFilename, options);
                    if (!isNullable) {
                        return propertyAssignments;
                    }
                    return [
                        ...propertyAssignments,
                        factory.createPropertyAssignment('nullable', (0, ast_utils_1.createBooleanLiteral)(factory, true))
                    ];
                }
            }
        }
        const type = typeChecker.getTypeAtLocation(node);
        if (!type) {
            return [];
        }
        const typeReferenceDescriptor = (0, plugin_utils_1.getTypeReferenceAsString)(type, typeChecker);
        if (!typeReferenceDescriptor.typeName) {
            return [];
        }
        const identifier = (0, type_reference_to_identifier_util_1.typeReferenceToIdentifier)(typeReferenceDescriptor, hostFilename, options, factory, type, this._typeImports);
        const initializer = factory.createArrowFunction(undefined, undefined, [], undefined, undefined, identifier);
        return [factory.createPropertyAssignment(key, initializer)];
    }
    createInitializerForTypeLiteralNode(node, factory, typeChecker, existingProperties, hostFilename, options) {
        const propertyAssignments = Array.from(node.members || []).map((member) => {
            const literalExpr = this.createDecoratorObjectLiteralExpr(factory, member, typeChecker, existingProperties, options, hostFilename);
            return factory.createPropertyAssignment(factory.createIdentifier(member.name.getText()), literalExpr);
        });
        const initializer = factory.createArrowFunction(undefined, undefined, [], undefined, undefined, factory.createParenthesizedExpression(factory.createObjectLiteralExpression(propertyAssignments)));
        return initializer;
    }
    isNullableUnion(node) {
        const nullableType = node.types.find((type) => type.kind === ts.SyntaxKind.NullKeyword ||
            (ts.SyntaxKind.LiteralType && type.getText() === 'null'));
        const isNullable = !!nullableType;
        return { nullableType, isNullable };
    }
    createEnumPropertyAssignment(factory, node, typeChecker, existingProperties, hostFilename, options) {
        const key = 'enum';
        if ((0, plugin_utils_1.hasPropertyKey)(key, existingProperties)) {
            return undefined;
        }
        let type = typeChecker.getTypeAtLocation(node);
        if (!type) {
            return undefined;
        }
        if ((0, plugin_utils_1.isAutoGeneratedTypeUnion)(type)) {
            const types = type.types;
            type = types[types.length - 1];
        }
        const typeIsArrayTuple = (0, plugin_utils_1.extractTypeArgumentIfArray)(type);
        if (!typeIsArrayTuple) {
            return undefined;
        }
        let isArrayType = typeIsArrayTuple.isArray;
        type = typeIsArrayTuple.type;
        const isEnumMember = type.symbol && type.symbol.flags === ts.SymbolFlags.EnumMember;
        if (!(0, ast_utils_1.isEnum)(type) || isEnumMember) {
            if (!isEnumMember) {
                type = (0, plugin_utils_1.isAutoGeneratedEnumUnion)(type, typeChecker);
            }
            if (!type) {
                return undefined;
            }
            const typeIsArrayTuple = (0, plugin_utils_1.extractTypeArgumentIfArray)(type);
            if (!typeIsArrayTuple) {
                return undefined;
            }
            isArrayType = typeIsArrayTuple.isArray;
            type = typeIsArrayTuple.type;
        }
        const typeReferenceDescriptor = { typeName: (0, ast_utils_1.getText)(type, typeChecker) };
        const enumIdentifier = (0, type_reference_to_identifier_util_1.typeReferenceToIdentifier)(typeReferenceDescriptor, hostFilename, options, factory, type, this._typeImports);
        const enumProperty = factory.createPropertyAssignment(key, enumIdentifier);
        if (isArrayType) {
            const isArrayKey = 'isArray';
            const isArrayProperty = factory.createPropertyAssignment(isArrayKey, factory.createIdentifier('true'));
            return [enumProperty, isArrayProperty];
        }
        return enumProperty;
    }
    createDefaultPropertyAssignment(factory, node, existingProperties, options) {
        const key = 'default';
        if ((0, plugin_utils_1.hasPropertyKey)(key, existingProperties)) {
            return undefined;
        }
        let initializer = node.initializer;
        if (!initializer) {
            return undefined;
        }
        if (ts.isAsExpression(initializer)) {
            initializer = initializer.expression;
        }
        initializer =
            this.clonePrimitiveLiteral(factory, initializer) ?? initializer;
        if (!(0, plugin_utils_1.canReferenceNode)(initializer, options)) {
            const parentFilePath = node.getSourceFile().fileName;
            const propertyName = node.name.getText();
            plugin_debug_logger_1.pluginDebugLogger.debug(`Skipping registering default value for "${propertyName}" property in "${parentFilePath}" file because it is not a referenceable value ("${initializer.getText()}").`);
            return undefined;
        }
        return factory.createPropertyAssignment(key, initializer);
    }
    createValidationPropertyAssignments(factory, node, options) {
        const assignments = [];
        const decorators = ts.canHaveDecorators(node) && ts.getDecorators(node);
        if (!options.readonly) {
            this.addPropertyByValidationDecorator(factory, 'IsIn', 'enum', decorators, assignments, options);
        }
        this.addPropertyByValidationDecorator(factory, 'Min', 'minimum', decorators, assignments, options);
        this.addPropertyByValidationDecorator(factory, 'Max', 'maximum', decorators, assignments, options);
        this.addPropertyByValidationDecorator(factory, 'MinLength', 'minLength', decorators, assignments, options);
        this.addPropertyByValidationDecorator(factory, 'MaxLength', 'maxLength', decorators, assignments, options);
        this.addPropertiesByValidationDecorator(factory, 'IsPositive', decorators, assignments, () => {
            return [
                factory.createPropertyAssignment('minimum', (0, ast_utils_1.createPrimitiveLiteral)(factory, 1))
            ];
        });
        this.addPropertiesByValidationDecorator(factory, 'IsNegative', decorators, assignments, () => {
            return [
                factory.createPropertyAssignment('maximum', (0, ast_utils_1.createPrimitiveLiteral)(factory, -1))
            ];
        });
        this.addPropertiesByValidationDecorator(factory, 'Length', decorators, assignments, (decoratorRef) => {
            const decoratorArguments = (0, ast_utils_1.getDecoratorArguments)(decoratorRef);
            const result = [];
            const minLength = (0, lodash_1.head)(decoratorArguments);
            if (!(0, plugin_utils_1.canReferenceNode)(minLength, options)) {
                return result;
            }
            const clonedMinLength = this.clonePrimitiveLiteral(factory, minLength);
            if (clonedMinLength) {
                result.push(factory.createPropertyAssignment('minLength', clonedMinLength));
            }
            if (decoratorArguments.length > 1) {
                const maxLength = decoratorArguments[1];
                if (!(0, plugin_utils_1.canReferenceNode)(maxLength, options)) {
                    return result;
                }
                const clonedMaxLength = this.clonePrimitiveLiteral(factory, maxLength);
                if (clonedMaxLength) {
                    result.push(factory.createPropertyAssignment('maxLength', clonedMaxLength));
                }
            }
            return result;
        });
        this.addPropertiesByValidationDecorator(factory, 'Matches', decorators, assignments, (decoratorRef) => {
            const decoratorArguments = (0, ast_utils_1.getDecoratorArguments)(decoratorRef);
            return [
                factory.createPropertyAssignment('pattern', (0, ast_utils_1.createPrimitiveLiteral)(factory, (0, lodash_1.head)(decoratorArguments).text))
            ];
        });
        return assignments;
    }
    addPropertyByValidationDecorator(factory, decoratorName, propertyKey, decorators, assignments, options) {
        this.addPropertiesByValidationDecorator(factory, decoratorName, decorators, assignments, (decoratorRef) => {
            const argument = (0, lodash_1.head)((0, ast_utils_1.getDecoratorArguments)(decoratorRef));
            const assignment = this.clonePrimitiveLiteral(factory, argument) ?? argument;
            if (!(0, plugin_utils_1.canReferenceNode)(assignment, options)) {
                return [];
            }
            return [factory.createPropertyAssignment(propertyKey, assignment)];
        });
    }
    addPropertiesByValidationDecorator(factory, decoratorName, decorators, assignments, addPropertyAssignments) {
        const decoratorRef = (0, plugin_utils_1.getDecoratorOrUndefinedByNames)([decoratorName], decorators, factory);
        if (!decoratorRef) {
            return;
        }
        assignments.push(...addPropertyAssignments(decoratorRef));
    }
    addClassMetadata(node, objectLiteral, sourceFile, metadata) {
        const hostClass = node.parent;
        const className = hostClass.name && hostClass.name.getText();
        if (!className) {
            return;
        }
        const propertyName = node.name && node.name.getText(sourceFile);
        if (!propertyName ||
            (node.name && node.name.kind === ts.SyntaxKind.ComputedPropertyName)) {
            return;
        }
        metadata[propertyName] = objectLiteral;
    }
    createDescriptionAndTsDocTagPropertyAssigments(factory, node, typeChecker, existingProperties = factory.createNodeArray(), options = {}, sourceFile) {
        if (!options.introspectComments || !sourceFile) {
            return [];
        }
        const propertyAssignments = [];
        const comments = (0, ast_utils_1.getMainCommentOfNode)(node, sourceFile);
        const tags = (0, ast_utils_1.getTsDocTagsOfNode)(node, sourceFile, typeChecker);
        const keyOfComment = options.dtoKeyOfComment;
        if (!(0, plugin_utils_1.hasPropertyKey)(keyOfComment, existingProperties) && comments) {
            const descriptionPropertyAssignment = factory.createPropertyAssignment(keyOfComment, factory.createStringLiteral(comments));
            propertyAssignments.push(descriptionPropertyAssignment);
        }
        const hasExampleOrExamplesKey = (0, plugin_utils_1.hasPropertyKey)('example', existingProperties) ||
            (0, plugin_utils_1.hasPropertyKey)('examples', existingProperties);
        if (!hasExampleOrExamplesKey && tags.example?.length) {
            if (tags.example.length === 1) {
                const examplePropertyAssignment = factory.createPropertyAssignment('example', (0, ast_utils_1.createLiteralFromAnyValue)(factory, tags.example[0]));
                propertyAssignments.push(examplePropertyAssignment);
            }
            else {
                const examplesPropertyAssignment = factory.createPropertyAssignment('examples', (0, ast_utils_1.createLiteralFromAnyValue)(factory, tags.example));
                propertyAssignments.push(examplesPropertyAssignment);
            }
        }
        const hasDeprecatedKey = (0, plugin_utils_1.hasPropertyKey)('deprecated', existingProperties);
        if (!hasDeprecatedKey && tags.deprecated) {
            const deprecatedPropertyAssignment = factory.createPropertyAssignment('deprecated', (0, ast_utils_1.createLiteralFromAnyValue)(factory, tags.deprecated));
            propertyAssignments.push(deprecatedPropertyAssignment);
        }
        return propertyAssignments;
    }
    normalizeImportPath(pathToSource, path) {
        let relativePath = path_1.posix.relative((0, plugin_utils_1.convertPath)(pathToSource), (0, plugin_utils_1.convertPath)(path));
        relativePath = relativePath[0] !== '.' ? './' + relativePath : relativePath;
        return relativePath;
    }
    clonePrimitiveLiteral(factory, node) {
        const primitiveTypeName = this.getInitializerPrimitiveTypeName(node);
        if (!primitiveTypeName) {
            return undefined;
        }
        const text = node.text ?? node.getText();
        return (0, ast_utils_1.createPrimitiveLiteral)(factory, text, primitiveTypeName);
    }
    getInitializerPrimitiveTypeName(node) {
        if (ts.isIdentifier(node) &&
            (node.text === 'true' || node.text === 'false')) {
            return 'boolean';
        }
        if (ts.isNumericLiteral(node) || ts.isPrefixUnaryExpression(node)) {
            return 'number';
        }
        if (ts.isStringLiteral(node)) {
            return 'string';
        }
        return undefined;
    }
}
exports.ModelClassVisitor = ModelClassVisitor;
