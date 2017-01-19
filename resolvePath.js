import path from 'path';

export default function(folderPath) {
  if (folderPath[0] === '/' || folderPath[0] === '~') {
    return folderPath;
  }
  return path.join(process.cwd(), folderPath);
};
