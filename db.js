const { Pool } = require('pg');

let pool = null;
let initPromise = null;

const getDatabaseUrl = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for PostgreSQL database access. Copy .env.example to .env or export DATABASE_URL before starting the app.'
    );
  }

  return process.env.DATABASE_URL;
};

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error', err);
    });
  }

  return pool;
};

const query = async (sql, params = []) => {
  const db = await initDb();
  return db.query(sql, params);
};

const initDb = async () => {
  if (!initPromise) {
    initPromise = getPool()
      .query('SELECT 1')
      .then(() => pool)
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }

  return initPromise;
};

const listRecipes = async () => {
  const result = await query(
    `
      SELECT id, title, time_minutes, price, link, description
      FROM recipes
      ORDER BY id
    `
  );

  return result.rows;
};

const getRecipe = async (id) => {
  const result = await query(
    `
      SELECT id, title, time_minutes, price, link, description
      FROM recipes
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0];
};

const listRecipeIngredients = async (recipeId) => {
  const result = await query(
    `
      SELECT i.id, i.name, ri.amount, ri.unit
      FROM ingredients i
      JOIN recipe_ingredients ri ON i.id = ri.ingredient_id
      WHERE ri.recipe_id = $1
    `,
    [recipeId]
  );

  return result.rows;
};

const listRecipeTags = async (recipeId) => {
  const result = await query(
    `
      SELECT t.id, t.name
      FROM tags t
      JOIN recipe_tags rt ON t.id = rt.tag_id
      WHERE rt.recipe_id = $1
    `,
    [recipeId]
  );

  return result.rows;
};

const listIngredients = async () => {
  const result = await query(
    `
      SELECT id, name
      FROM ingredients
      ORDER BY id
    `
  );

  return result.rows;
};

const listTags = async () => {
  const result = await query(
    `
      SELECT id, name
      FROM tags
      ORDER BY id
    `
  );

  return result.rows;
};

module.exports = {
  initDb,
  listRecipes,
  getRecipe,
  listRecipeIngredients,
  listRecipeTags,
  listIngredients,
  listTags,
};
