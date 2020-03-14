import fs from 'fs';
import path from 'path';
import archieml from 'archieml';

class Chapter {
  constructor (filename) {
    this.filename = filename;
    this._json = {};
    this.sections = [];
  }

  fetch() {
    return fetch('/' + this.filename)
      .then((response) => {
        return response.text()
      })
      .then((text) => {
        const json = this._json = archieml.load(text);
        this.sections = json.sections.map((id) => json[id])
        return this;
      })
  }
}

module.exports = Chapter;