import { Type } from '@nestjs/common';
import { Constructor } from '@automapper/core';
export declare function clonePluginMetadataFactory(target: Type<unknown>, parent: Type<unknown>, transformFn?: (metadata: Record<string, any>) => Record<string, any>): void;
export declare function inheritAutoMapMetadata(parentClass: Constructor, targetClass: Function, isPropertyInherited?: (key: string) => boolean): void;
