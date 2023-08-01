import { Type } from '@nestjs/common';
import { identity } from 'lodash';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants';
import { AutoMapperLogger, Constructor } from '@automapper/core';
import {
  AUTOMAP_PROPERTIES_METADATA_KEY,
  getMetadataList
} from '@automapper/classes';

export function clonePluginMetadataFactory(
  target: Type<unknown>,
  parent: Type<unknown>,
  transformFn: (metadata: Record<string, any>) => Record<string, any> = identity
) {
  let targetMetadata = {};

  do {
    if (!parent.constructor) {
      return;
    }
    if (!parent.constructor[METADATA_FACTORY_NAME]) {
      continue;
    }
    const parentMetadata = parent.constructor[METADATA_FACTORY_NAME]();
    targetMetadata = {
      ...parentMetadata,
      ...targetMetadata
    };
  } while (
    (parent = Reflect.getPrototypeOf(parent) as Type<any>) &&
    parent !== Object.prototype &&
    parent
  );
  targetMetadata = transformFn(targetMetadata);

  if (target[METADATA_FACTORY_NAME]) {
    const originalFactory = target[METADATA_FACTORY_NAME];
    target[METADATA_FACTORY_NAME] = () => {
      const originalMetadata = originalFactory();
      return {
        ...originalMetadata,
        ...targetMetadata
      };
    };
  } else {
    target[METADATA_FACTORY_NAME] = () => targetMetadata;
  }
}

export function inheritAutoMapMetadata(
  parentClass: Constructor,
  // eslint-disable-next-line @typescript-eslint/ban-types
  targetClass: Function,
  isPropertyInherited: (key: string) => boolean = () => true
) {
  try {
    const [parentClassMetadataList] = getMetadataList(parentClass);
    if (!parentClassMetadataList.length) {
      return;
    }

    const [existingMetadataList] = getMetadataList(targetClass as Constructor);
    Reflect.defineMetadata(
      AUTOMAP_PROPERTIES_METADATA_KEY,
      [
        ...existingMetadataList,
        ...parentClassMetadataList.filter(([propertyKey]) =>
          isPropertyInherited(propertyKey)
        )
      ],
      targetClass
    );
  } catch (e) {
    if (AutoMapperLogger.error) {
      AutoMapperLogger.error(`Error trying to inherit metadata: ${e}`);
    }
  }
}
