const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const TABLES = [
  'recipes',
  'ingredients',
  'tags',
  'recipe_ingredients',
  'recipe_tags',
];

const TABLES_WITH_IDENTITIES = ['recipes', 'ingredients', 'tags'];

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const openSqlite = (databasePath) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });

const closeSqlite = (db) =>
  new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

const allSqlite = (db, sql) =>
  new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

const countSqliteRows = async (db) => {
  const counts = {};

  for (const table of TABLES) {
    const rows = await allSqlite(db, `SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = rows[0].count;
  }

  return counts;
};

const countPostgresRows = async (client) => {
  const counts = {};

  for (const table of TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = result.rows[0].count;
  }

  return counts;
};

const printCounts = (label, counts) => {
  console.log(label);

  for (const table of TABLES) {
    console.log(`  ${table}: ${counts[table]}`);
  }
};

const readSqliteData = async (db) => ({
  recipes: await allSqlite(
    db,
    `
      SELECT id, title, time_minutes, price, link, description, image
      FROM recipes
      ORDER BY id
    `
  ),
  ingredients: await allSqlite(
    db,
    `
      SELECT id, name
      FROM ingredients
      ORDER BY id
    `
  ),
  tags: await allSqlite(
    db,
    `
      SELECT id, name
      FROM tags
      ORDER BY id
    `
  ),
  recipe_ingredients: await allSqlite(
    db,
    `
      SELECT recipe_id, ingredient_id, amount, unit
      FROM recipe_ingredients
      ORDER BY rowid
    `
  ),
  recipe_tags: await allSqlite(
    db,
    `
      SELECT recipe_id, tag_id
      FROM recipe_tags
      ORDER BY rowid
    `
  ),
});

const truncatePostgresTables = async (client) => {
  await client.query(`
    TRUNCATE TABLE
      recipe_tags,
      recipe_ingredients,
      tags,
      ingredients,
      recipes
    RESTART IDENTITY
  `);
};

const insertRows = async (client, data) => {
  for (const row of data.recipes) {
    await client.query(
      `
        INSERT INTO recipes (id, title, time_minutes, price, link, description, image)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [row.id, row.title, row.time_minutes, row.price, row.link, row.description, row.image]
    );
  }

  for (const row of data.ingredients) {
    await client.query(
      `
        INSERT INTO ingredients (id, name)
        VALUES ($1, $2)
      `,
      [row.id, row.name]
    );
  }

  for (const row of data.tags) {
    await client.query(
      `
        INSERT INTO tags (id, name)
        VALUES ($1, $2)
      `,
      [row.id, row.name]
    );
  }

  for (const row of data.recipe_ingredients) {
    await client.query(
      `
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit)
        VALUES ($1, $2, $3, $4)
      `,
      [row.recipe_id, row.ingredient_id, row.amount, row.unit]
    );
  }

  for (const row of data.recipe_tags) {
    await client.query(
      `
        INSERT INTO recipe_tags (recipe_id, tag_id)
        VALUES ($1, $2)
      `,
      [row.recipe_id, row.tag_id]
    );
  }
};

const syncIdentitySequence = async (client, table) => {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('${table}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${table}), 1),
      (SELECT COUNT(*) > 0 FROM ${table})
    )
  `);
};

const syncIdentitySequences = async (client) => {
  for (const table of TABLES_WITH_IDENTITIES) {
    await syncIdentitySequence(client, table);
  }
};

const targetHasRows = (counts) => TABLES.some((table) => counts[table] > 0);

const migrateData = async (sqliteDb, pool) => {
  const forceMigration = process.env.FORCE_MIGRATION === 'true';
  const sourceCounts = await countSqliteRows(sqliteDb);
  const data = await readSqliteData(sqliteDb);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const targetBeforeCounts = await countPostgresRows(client);
    printCounts('SQLite source row counts before migration:', sourceCounts);
    printCounts('PostgreSQL target row counts before migration:', targetBeforeCounts);

    if (targetBeforeCounts.recipes > 0) {
      console.log('PostgreSQL target already contains recipe rows.');
    }

    if (targetHasRows(targetBeforeCounts)) {
      if (!forceMigration) {
        throw new Error('PostgreSQL target tables are not empty. Set FORCE_MIGRATION=true to replace target data.');
      }

      console.log('FORCE_MIGRATION=true; clearing PostgreSQL target tables before import.');
      await truncatePostgresTables(client);
    }

    await insertRows(client, data);
    await syncIdentitySequences(client);

    const targetAfterCounts = await countPostgresRows(client);
    printCounts('PostgreSQL target row counts after migration:', targetAfterCounts);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const main = async () => {
  const databasePath = requireEnv('DATABASE_PATH');
  const databaseUrl = requireEnv('DATABASE_URL');
  let sqliteDb;
  let pool;

  try {
    sqliteDb = await openSqlite(databasePath);
    pool = new Pool({ connectionString: databaseUrl });
    await migrateData(sqliteDb, pool);
    console.log('SQLite to PostgreSQL data migration completed.');
  } finally {
    if (sqliteDb) {
      await closeSqlite(sqliteDb);
    }

    if (pool) {
      await pool.end();
    }
  }
};

main().catch((err) => {
  console.error(`SQLite to PostgreSQL data migration failed: ${err.message}`);
  process.exit(1);
});
