// ts-resolve.mjs — Node не находит './rules' без расширения, дописываем .ts
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
