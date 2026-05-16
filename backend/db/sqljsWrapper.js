/**
 * Wraps sql.js to provide a better-sqlite3-compatible synchronous API.
 * Used as fallback when better-sqlite3 native build isn't available.
 */
const fs = require('fs');
const path = require('path');

class Statement {
  constructor(sqlDb, sql, dbPath, sqljs) {
    this.sqlDb = sqlDb;
    this.sql = sql;
    this.dbPath = dbPath;
    this.sqljs = sqljs;
  }

  _save() {
    const data = this.sqlDb.export();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  _isWrite() {
    const s = this.sql.trim().toUpperCase();
    return s.startsWith('INSERT') || s.startsWith('UPDATE') || s.startsWith('DELETE') || s.startsWith('CREATE') || s.startsWith('DROP') || s.startsWith('ALTER');
  }

  get(params = []) {
    const args = Array.isArray(params) ? params : [params];
    try {
      const stmt = this.sqlDb.prepare(this.sql);
      stmt.bind(args);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    } catch (e) { throw e; }
  }

  all(...params) {
    const args = params.flat();
    try {
      const results = this.sqlDb.exec(this.sql, args);
      if (!results.length) return [];
      const { columns, values } = results[0];
      return values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
      });
    } catch (e) { throw e; }
  }

  run(...params) {
    const args = params.flat();
    try {
      this.sqlDb.run(this.sql, args);
      const lastId = this.sqlDb.exec('SELECT last_insert_rowid() as id');
      const changes = this.sqlDb.exec('SELECT changes() as c');
      this._save();
      return {
        lastInsertRowid: lastId[0]?.values[0]?.[0] || 0,
        changes: changes[0]?.values[0]?.[0] || 0,
      };
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        const err = new Error(e.message);
        err.message = e.message;
        throw err;
      }
      throw e;
    }
  }
}

class SqlJsWrapper {
  constructor(sqlDb, dbPath, sqljs) {
    this.sqlDb = sqlDb;
    this.dbPath = dbPath;
    this.sqljs = sqljs;
  }

  pragma() { /* no-op for sql.js */ }

  exec(sql) {
    this.sqlDb.run(sql);
    this._save();
  }

  _save() {
    const data = this.sqlDb.export();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  prepare(sql) {
    return new Statement(this.sqlDb, sql, this.dbPath, this.sqljs);
  }
}

module.exports = SqlJsWrapper;
