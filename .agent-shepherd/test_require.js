try {
  const { ArchiveLogger } = require('./src/core/archive-logger');
  console.log('ArchiveLogger imported successfully:', !!ArchiveLogger);
  console.log('ArchiveLogger constructor:', typeof ArchiveLogger);
} catch (e) {
  console.error('Error importing ArchiveLogger:', e);
}
