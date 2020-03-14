const { existsSync, readFile, readFileSync, writeFile } = require('fs');
const path = require('path');
const { promisify } = require('util');
const archieml = require('archieml');
const rf = promisify(readFile)
const wf = promisify(writeFile)

const AML_PATH = path.resolve(__dirname, 'public', 'aml');
const TOC_PATH = path.resolve(__dirname, 'public', 'json', 'toc.json');

function getFilePath(name) {
  const fp = path.resolve(AML_PATH, `${name}.aml`);
  return (existsSync(fp)) ? fp : null
}


const chapterListPath = getFilePath('chapters');
if (chapterListPath) {
  const contents = [];
  const data = readFileSync(chapterListPath, 'utf8');
  const { chapters=[] } = archieml.load(data);

  const reads = chapters.map((c) => {
    const fp = getFilePath(c);
    if (fp) {
      return rf(fp, 'utf8');
    } else {
      return Promise.resolve();
    }
  })

  Promise.all(reads)
    .then((files) => {
      files.forEach((file, i) => {
        const { type='chapter', title, sections } = archieml.load(file)
        contents.push({
          fileName: chapters[i],
          type,
          title,
          sections
        })
      })
      const fileContents = JSON.stringify({
        updatedAt: Date.parse(new Date()),
        contents
      })
      const toWrite = new Uint8Array(Buffer.from(fileContents));
      return wf(TOC_PATH, toWrite)
    }).then(() => {
      console.log('finished!');
    }).catch((e) => {
      console.log('OH NO!', e);
    })
}