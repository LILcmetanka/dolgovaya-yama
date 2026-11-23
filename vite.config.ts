import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths make the build work both at a custom domain
  // and at https://username.github.io/repository-name/.
  base: './',
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Phaser (шаг 36) — отдельным чанком: движок весит больше мегабайта, а меняется редко. С отдельным файлом
        // браузер держит его в кеше между сборками, и правка игры перекачивает только свой маленький чанк.
        // Имя чанка — по пакету, а не по хешу: так кеш переживает и хеш основного файла.
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
});
