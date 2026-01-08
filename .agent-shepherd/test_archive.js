import { ArchiveLogger } from './src/core/archive-logger.ts';
try {
  const al = new ArchiveLogger();
  console.log('ArchiveLogger created successfully');
  console.log('Archive size:', al.getArchiveSize());
  console.log('Archive run count:', al.getArchivedRunCount());
  al.close();
} catch (error) {
  console.error('Error:', error);
}
