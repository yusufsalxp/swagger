"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLiteralFromAnyValue = exports.createPrimitiveLiteral = exports.createBooleanLiteral = exports.findNullableTypeFromUnion = exports.getDecoratorName = exports.getDecoratorArguments = exports.getTsDocTagsOfNode = exports.getMainCommentOfNode = exports.getDefaultTypeFormatFlags = exports.getText = exports.hasObjectFlag = exports.hasFlag = exports.isEnumLiteral = exports.isEnum = exports.isInterface = exports.isBigInt = exports.isNumber = exports.isStringLiteral = exports.isString = exports.isBoolean = exports.getTypeArguments = exports.isArray = void 0;
const typescript_1 = require("typescript");
const plugin_utils_1 = require("./plugin-utils");
function isArray(type) {
    const symbol = type.getSymbol();
    if (!symbol) {
        return false;
    }
    return symbol.getName() === 'Array' && getTypeArguments(type).length === 1;
}
exports.isArray = isArray;
function getTypeArguments(type) {
    return type.typeArguments || [];
}
exports.getTypeArguments = getTypeArguments;
function isBoolean(type) {
    return hasFlag(type, typescript_1.TypeFlags.Boolean);
}
exports.isBoolean = isBoolean;
function isString(type) {
    return hasFlag(type, typescript_1.TypeFlags.String);
}
exports.isString = isString;
function isStringLiteral(type) {
    return hasFlag(type, typescript_1.TypeFlags.StringLiteral) && !type.isUnion();
}
exports.isStringLiteral = isStringLiteral;
function isNumber(type) {
    return hasFlag(type, typescript_1.TypeFlags.Number);
}
exports.isNumber = isNumber;
function isBigInt(type) {
    return hasFlag(type, typescript_1.TypeFlags.BigInt);
}
exports.isBigInt = isBigInt;
function isInterface(type) {
    return hasObjectFlag(type, typescript_1.ObjectFlags.Interface);
}
exports.isInterface = isInterface;
function isEnum(type) {
    const hasEnumFlag = hasFlag(type, typescript_1.TypeFlags.Enum);
    if (hasEnumFlag) {
        return true;
    }
    if (isEnumLiteral(type)) {
        return false;
    }
    const symbol = type.getSymbol();
    if (!symbol) {
        return false;
    }
    const valueDeclaration = symbol.valueDeclaration;
    if (!valueDeclaration) {
        return false;
    }
    return valueDeclaration.kind === typescript_1.SyntaxKind.EnumDeclaration;
}
exports.isEnum = isEnum;
function isEnumLiteral(type) {
    return hasFlag(type, typescript_1.TypeFlags.EnumLiteral) && !type.isUnion();
}
exports.isEnumLiteral = isEnumLiteral;
function hasFlag(type, flag) {
    return (type.flags & flag) === flag;
}
exports.hasFlag = hasFlag;
function hasObjectFlag(type, flag) {
    return (type.objectFlags & flag) === flag;
}
exports.hasObjectFlag = hasObjectFlag;
function getText(type, typeChecker, enclosingNode, typeFormatFlags) {
    if (!typeFormatFlags) {
        typeFormatFlags = getDefaultTypeFormatFlags(enclosingNode);
    }
    const compilerNode = !enclosingNode ? undefined : enclosingNode;
    return typeChecker.typeToString(type, compilerNode, typeFormatFlags);
}
exports.getText = getText;
function getDefaultTypeFormatFlags(enclosingNode) {
    let formatFlags = typescript_1.TypeFormatFlags.UseTypeOfFunction |
        typescript_1.TypeFormatFlags.NoTruncation |
        typescript_1.TypeFormatFlags.UseFullyQualifiedType |
        typescript_1.TypeFormatFlags.WriteTypeArgumentsOfSignature;
    if (enclosingNode && enclosingNode.kind === typescript_1.SyntaxKind.TypeAliasDeclaration)
        formatFlags |= typescript_1.TypeFormatFlags.InTypeAlias;
    return formatFlags;
}
exports.getDefaultTypeFormatFlags = getDefaultTypeFormatFlags;
function getMainCommentOfNode(node, sourceFile) {
    const sourceText = sourceFile.getFullText();
    const replaceRegex = /^\s*\** *@.*$|^\s*\/\*+ *|^\s*\/\/+.*|^\s*\/+ *|^\s*\*+ *| +$| *\**\/ *$/gim;
    const commentResult = [];
    const introspectComments = (comments) => comments?.forEach((comment) => {
        const commentSource = sourceText.substring(comment.pos, comment.end);
        const oneComment = commentSource.replace(replaceRegex, '').trim();
        if (oneComment) {
            commentResult.push(oneComment);
        }
    });
    const leadingCommentRanges = (0, typescript_1.getLeadingCommentRanges)(sourceText, node.getFullStart());
    introspectComments(leadingCommentRanges);
    if (!commentResult.length) {
        const trailingCommentRanges = (0, typescript_1.getTrailingCommentRanges)(sourceText, node.getFullStart());
        introspectComments(trailingCommentRanges);
    }
    return commentResult.join('\n');
}
exports.getMainCommentOfNode = getMainCommentOfNode;
function getTsDocTagsOfNode(node, sourceFile, typeChecker) {
    const sourceText = sourceFile.getFullText();
    const tagDefinitions = {
        example: {
            regex: /@example *((['"](?<string>.+?)['"])|(?<booleanOrNumber>[^ ]+?)|(?<array>(\[.+?\]))) *$/gim,
            hasProperties: true,
            repeatable: true
        },
        deprecated: {
            regex: /@deprecated */gim,
            hasProperties: false,
            repeatable: false
        }
    };
    const tagResults = {};
    const introspectTsDocTags = (comments) => comments?.forEach((comment) => {
        const commentSource = sourceText.substring(comment.pos, comment.end);
        for (const tag in tagDefinitions) {
            const { regex, hasProperties, repeatable } = tagDefinitions[tag];
            let value;
            let execResult;
            while ((execResult = regex.exec(commentSource)) &&
                (!hasProperties || execResult.length > 1)) {
                if (repeatable && !tagResults[tag])
                    tagResults[tag] = [];
                if (hasProperties) {
                    const docValue = execResult.groups?.string ??
                        execResult.groups?.booleanOrNumber ??
                        (execResult.groups?.array &&
                            execResult.groups.array.replace(/'/g, '"'));
                    const type = typeChecker.getTypeAtLocation(node);
                    value = docValue;
                    if (!type || !isString(type)) {
                        try {
                            value = JSON.parse(value);
                        }
                        catch { }
                    }
                }
                else {
                    value = true;
                }
                if (repeatable) {
                    tagResults[tag].push(value);
                }
                else {
                    tagResults[tag] = value;
                }
            }
        }
    });
    const leadingCommentRanges = (0, typescript_1.getLeadingCommentRanges)(sourceText, node.getFullStart());
    introspectTsDocTags(leadingCommentRanges);
    return tagResults;
}
exports.getTsDocTagsOfNode = getTsDocTagsOfNode;
function getDecoratorArguments(decorator) {
    const callExpression = decorator.expression;
    return (callExpression && callExpression.arguments) || [];
}
exports.getDecoratorArguments = getDecoratorArguments;
function getDecoratorName(decorator) {
    const isDecoratorFactory = decorator.expression.kind === typescript_1.SyntaxKind.CallExpression;
    if (isDecoratorFactory) {
        const callExpression = decorator.expression;
        const identifier = callExpression
            .expression;
        if ((0, plugin_utils_1.isDynamicallyAdded)(identifier)) {
            return undefined;
        }
        return getIdentifierFromName(callExpression.expression).getText();
    }
    return getIdentifierFromName(decorator.expression).getText();
}
exports.getDecoratorName = getDecoratorName;
function getIdentifierFromName(expression) {
    const identifier = getNameFromExpression(expression);
    if (expression && expression.kind !== typescript_1.SyntaxKind.Identifier) {
        throw new Error();
    }
    return identifier;
}
function getNameFromExpression(expression) {
    if (expression && expression.kind === typescript_1.SyntaxKind.PropertyAccessExpression) {
        return expression.name;
    }
    return expression;
}
function findNullableTypeFromUnion(typeNode, typeChecker) {
    return typeNode.types.find((tNode) => hasFlag(typeChecker.getTypeAtLocation(tNode), typescript_1.TypeFlags.Null));
}
exports.findNullableTypeFromUnion = findNullableTypeFromUnion;
function createBooleanLiteral(factory, flag) {
    return flag ? factory.createTrue() : factory.createFalse();
}
exports.createBooleanLiteral = createBooleanLiteral;
function createPrimitiveLiteral(factory, item, typeOfItem = typeof item) {
    switch (typeOfItem) {
        case 'boolean':
            return createBooleanLiteral(factory, item);
        case 'number': {
            if (item < 0) {
                return factory.createPrefixUnaryExpression(typescript_1.SyntaxKind.MinusToken, factory.createNumericLiteral(Math.abs(item)));
            }
            return factory.createNumericLiteral(item);
        }
        case 'string':
            return factory.createStringLiteral(item);
    }
}
exports.createPrimitiveLiteral = createPrimitiveLiteral;
function createLiteralFromAnyValue(factory, item) {
    return Array.isArray(item)
        ? factory.createArrayLiteralExpression(item.map((item) => createLiteralFromAnyValue(factory, item)))
        : createPrimitiveLiteral(factory, item);
}
exports.createLiteralFromAnyValue = createLiteralFromAnyValue;
