const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATABASE_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'legacy', 'src', 'app.db');

let dbWrapper = null;

const wrapDb = (db) => ({
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this);
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  },
});

const openDb = () =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
    const db = new sqlite3.Database(DATABASE_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.configure('busyTimeout', 5000);
      resolve(wrapDb(db));
    });
  });

const createTables = async (db) => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      time_minutes INTEGER NOT NULL,
      price TEXT NOT NULL,
      link TEXT,
      description TEXT,
      image TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      recipe_id INTEGER,
      ingredient_id INTEGER,
      amount TEXT,
      unit TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS recipe_tags (
      recipe_id INTEGER,
      tag_id INTEGER,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);
};

const seedData = async (db) => {
  await db.run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const recipeCountRow = await db.get('SELECT COUNT(*) as count FROM recipes');
    if (recipeCountRow && recipeCountRow.count > 0) {
      await db.run('COMMIT');
      return;
    }

    const ingredients = [
      'Spaghetti',
      'Eggs',
      'Pancetta',
      'Parmesan Cheese',
      'Black Pepper',
      'Salt',
      'Chicken Breast',
      'Breadcrumbs',
      'Mozzarella Cheese',
      'Tomato Sauce',
      'Olive Oil',
      'Garlic',
      'Penne Pasta',
      'Bell Peppers',
      'Zucchini',
      'Cherry Tomatoes',
      'Basil',
      'Butter',
      'Flour',
      'Salmon Fillet',
      'Lemon',
      'Dill',
    ];

    for (const name of ingredients) {
      await db.run('INSERT INTO ingredients (name) VALUES (?)', [name]);
    }

    const tags = ['Italian', 'Quick', 'Dinner', 'Vegetarian', 'Healthy', 'Seafood'];
    for (const name of tags) {
      await db.run('INSERT INTO tags (name) VALUES (?)', [name]);
    }

    const recipes = [
      {
        title: 'Spaghetti Carbonara',
        time_minutes: 25,
        price: '12.50',
        link: 'http://example.com/carbonara',
        description: [
          'Step 1: Bring a large pot of salted water to boil and cook 400g spaghetti according to package directions.',
          'Step 2: While pasta cooks, cut 200g pancetta into small cubes and fry in a large pan over medium heat until crispy (about 5 minutes).',
          'Step 3: In a bowl, whisk together 4 large eggs, 100g grated Parmesan cheese, and plenty of black pepper.',
          'Step 4: When pasta is ready, reserve 1 cup of pasta water, then drain the pasta.',
          'Step 5: Remove the pan with pancetta from heat. Add the hot pasta to the pan and toss.',
          'Step 6: Pour the egg mixture over the pasta and toss quickly. The heat from the pasta will cook the eggs. Add pasta water bit by bit if needed to create a creamy sauce.',
          'Step 7: Serve immediately with extra Parmesan cheese and black pepper.',
        ].join('\n\n'),
      },
      {
        title: 'Chicken Parmesan',
        time_minutes: 50,
        price: '18.00',
        link: 'http://example.com/chicken-parm',
        description: [
          'Step 1: Preheat oven to 200C (400F).',
          'Step 2: Place 2 chicken breasts between plastic wrap and pound to 2cm thickness.',
          'Step 3: Set up breading station: flour in one plate, 2 beaten eggs in another, and 150g breadcrumbs mixed with 50g Parmesan in a third.',
          'Step 4: Season chicken with salt and pepper, then coat in flour, dip in egg, and press into breadcrumb mixture.',
          'Step 5: Heat 3 tablespoons olive oil in a large oven-safe skillet over medium-high heat. Fry chicken until golden brown, about 4 minutes per side.',
          'Step 6: Pour 300ml tomato sauce over the chicken, then top each breast with 100g sliced mozzarella.',
          'Step 7: Transfer skillet to oven and bake for 15-20 minutes until cheese is melted and bubbly.',
          'Step 8: Garnish with fresh basil and serve with pasta or salad.',
        ].join('\n\n'),
      },
      {
        title: 'Pasta Primavera',
        time_minutes: 30,
        price: '10.00',
        link: 'http://example.com/primavera',
        description: [
          'Step 1: Cook 350g penne pasta in salted boiling water according to package directions. Reserve 1 cup pasta water before draining.',
          'Step 2: While pasta cooks, chop 1 red bell pepper, 1 zucchini into bite-sized pieces, and halve 200g cherry tomatoes.',
          'Step 3: Heat 3 tablespoons olive oil in a large pan over medium-high heat. Add 3 minced garlic cloves and cook for 30 seconds.',
          'Step 4: Add bell peppers and zucchini to the pan. Cook for 5-7 minutes until vegetables are tender.',
          'Step 5: Add cherry tomatoes and cook for another 2-3 minutes until they start to soften.',
          'Step 6: Add the drained pasta to the pan with vegetables. Toss everything together, adding pasta water as needed to create a light sauce.',
          'Step 7: Season with salt and black pepper. Remove from heat and stir in fresh basil leaves.',
          'Step 8: Serve hot with grated Parmesan cheese on top.',
        ].join('\n\n'),
      },
      {
        title: 'Garlic Butter Salmon',
        time_minutes: 20,
        price: '22.00',
        link: 'http://example.com/salmon',
        description: [
          'Step 1: Pat 4 salmon fillets (150g each) dry with paper towels and season both sides with salt and pepper.',
          'Step 2: Heat 2 tablespoons olive oil in a large skillet over medium-high heat.',
          'Step 3: Place salmon fillets skin-side up in the pan. Cook for 4-5 minutes until golden brown.',
          'Step 4: Flip the salmon and cook for another 3-4 minutes.',
          'Step 5: Reduce heat to medium and add 3 tablespoons butter, 4 minced garlic cloves, and juice of 1 lemon to the pan.',
          'Step 6: Spoon the garlic butter sauce over the salmon repeatedly for 1-2 minutes.',
          'Step 7: Remove from heat and sprinkle with fresh dill.',
          'Step 8: Serve immediately with the pan sauce, accompanied by rice or vegetables.',
        ].join('\n\n'),
      },
    ];

    const recipeIds = [];
    for (const recipe of recipes) {
      const result = await db.run(
        'INSERT INTO recipes (title, time_minutes, price, link, description) VALUES (?, ?, ?, ?, ?)',
        [recipe.title, recipe.time_minutes, recipe.price, recipe.link, recipe.description]
      );
      recipeIds.push(result.lastID);
    }

    const recipeIngredients = [
      [recipeIds[0], 1, '400', 'g'],
      [recipeIds[0], 2, '4', 'large'],
      [recipeIds[0], 3, '200', 'g'],
      [recipeIds[0], 4, '100', 'g'],
      [recipeIds[0], 5, '1', 'tsp'],
      [recipeIds[0], 6, '1', 'tsp'],
      [recipeIds[1], 7, '2', 'pieces'],
      [recipeIds[1], 8, '150', 'g'],
      [recipeIds[1], 9, '100', 'g'],
      [recipeIds[1], 10, '300', 'ml'],
      [recipeIds[1], 11, '3', 'tbsp'],
      [recipeIds[1], 4, '50', 'g'],
      [recipeIds[1], 2, '2', 'large'],
      [recipeIds[1], 19, '100', 'g'],
      [recipeIds[1], 17, '10', 'leaves'],
      [recipeIds[2], 13, '350', 'g'],
      [recipeIds[2], 14, '1', 'piece'],
      [recipeIds[2], 15, '1', 'piece'],
      [recipeIds[2], 16, '200', 'g'],
      [recipeIds[2], 12, '3', 'cloves'],
      [recipeIds[2], 11, '3', 'tbsp'],
      [recipeIds[2], 17, '15', 'leaves'],
      [recipeIds[2], 4, '50', 'g'],
      [recipeIds[3], 20, '4', 'fillets'],
      [recipeIds[3], 18, '3', 'tbsp'],
      [recipeIds[3], 12, '4', 'cloves'],
      [recipeIds[3], 21, '1', 'piece'],
      [recipeIds[3], 22, '2', 'tbsp'],
      [recipeIds[3], 11, '2', 'tbsp'],
    ];

    for (const entry of recipeIngredients) {
      await db.run(
        'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit) VALUES (?, ?, ?, ?)',
        entry
      );
    }

    const recipeTags = [
      [recipeIds[0], 1],
      [recipeIds[0], 3],
      [recipeIds[1], 1],
      [recipeIds[1], 3],
      [recipeIds[2], 1],
      [recipeIds[2], 2],
      [recipeIds[2], 4],
      [recipeIds[2], 5],
      [recipeIds[3], 2],
      [recipeIds[3], 3],
      [recipeIds[3], 5],
      [recipeIds[3], 6],
    ];

    for (const entry of recipeTags) {
      await db.run('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', entry);
    }

    await db.run('COMMIT');
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to roll back database seed transaction', rollbackErr);
    }
    throw err;
  }
};

const initDb = async () => {
  if (dbWrapper) {
    return dbWrapper;
  }
  dbWrapper = await openDb();
  await createTables(dbWrapper);
  await seedData(dbWrapper);
  return dbWrapper;
};

const listRecipes = async () => {
  const db = await initDb();
  return db.all('SELECT id, title, time_minutes, price, link, description FROM recipes');
};

const getRecipe = async (id) => {
  const db = await initDb();
  return db.get(
    'SELECT id, title, time_minutes, price, link, description FROM recipes WHERE id = ?',
    [id]
  );
};

const listRecipeIngredients = async (recipeId) => {
  const db = await initDb();
  return db.all(
    `
    SELECT i.id, i.name, ri.amount, ri.unit
    FROM ingredients i
    JOIN recipe_ingredients ri ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
  `,
    [recipeId]
  );
};

const listRecipeTags = async (recipeId) => {
  const db = await initDb();
  return db.all(
    `
    SELECT t.id, t.name
    FROM tags t
    JOIN recipe_tags rt ON t.id = rt.tag_id
    WHERE rt.recipe_id = ?
  `,
    [recipeId]
  );
};

const listIngredients = async () => {
  const db = await initDb();
  return db.all('SELECT id, name FROM ingredients');
};

const listTags = async () => {
  const db = await initDb();
  return db.all('SELECT id, name FROM tags');
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
