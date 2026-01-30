const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const {
  initDb,
  listRecipes,
  getRecipe,
  listRecipeIngredients,
  listRecipeTags,
  listIngredients,
  listTags,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'base');
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', async (req, res, next) => {
  try {
    const recipes = await listRecipes();
    const recipesWithTags = [];

    for (const recipe of recipes) {
      const tags = await listRecipeTags(recipe.id);
      recipesWithTags.push({
        ...recipe,
        link: recipe.link || '',
        tags,
      });
    }

    res.render('home', { recipes: recipesWithTags });
  } catch (err) {
    next(err);
  }
});

app.get('/recipes/:id/', async (req, res, next) => {
  try {
    const recipeId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(recipeId)) {
      return res.status(400).send('Invalid recipe id');
    }

    const recipe = await getRecipe(recipeId);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }

    const ingredients = await listRecipeIngredients(recipeId);
    const tags = await listRecipeTags(recipeId);
    const steps = (recipe.description || '')
      .split('\n\n')
      .map((step) => step.trim())
      .filter(Boolean);

    res.render('recipe_detail', {
      recipe: {
        ...recipe,
        link: recipe.link || '',
        description: recipe.description || '',
        ingredients,
        tags,
        steps,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/user/create/', (req, res) => {
  const { email, password, name } = req.body || {};
  res.status(201).json({
    email,
    name,
  });
});

app.get('/api/user/me/', (req, res) => {
  res.json({
    email: 'user@example.com',
    name: 'Example User',
  });
});

app.put('/api/user/me/', (req, res) => {
  const { email, name } = req.body || {};
  res.json({
    email,
    name,
  });
});

app.patch('/api/user/me/', (req, res) => {
  const { email, name } = req.body || {};
  res.json({
    email: email || 'user@example.com',
    name: name || 'Example User',
  });
});

app.post('/api/user/token/', (req, res) => {
  const { email, password } = req.body || {};
  res.json({
    email,
    password,
  });
});

app.get('/api/recipe/recipes/', async (req, res, next) => {
  try {
    const recipes = await listRecipes();
    const result = [];

    for (const recipe of recipes) {
      const ingredients = await listRecipeIngredients(recipe.id);
      const tags = await listRecipeTags(recipe.id);
      result.push({
        ...recipe,
        link: recipe.link || '',
        ingredients,
        tags,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/recipe/recipes/', (req, res) => {
  const data = req.body || {};
  res.status(201).json({
    id: 1,
    title: data.title,
    time_minutes: data.time_minutes,
    price: data.price,
    link: data.link || '',
    tags: data.tags || [],
    ingredients: data.ingredients || [],
    description: data.description || '',
  });
});

app.get('/api/recipe/recipes/:id/', async (req, res, next) => {
  try {
    const recipeId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(recipeId)) {
      return res.status(400).send('Invalid recipe id');
    }

    const recipe = await getRecipe(recipeId);
    if (!recipe) {
      return res.status(404).send('Recipe not found');
    }

    const ingredients = await listRecipeIngredients(recipeId);
    const tags = await listRecipeTags(recipeId);

    res.json({
      ...recipe,
      link: recipe.link || '',
      description: recipe.description || '',
      ingredients,
      tags,
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/recipe/recipes/:id/', (req, res) => {
  const recipeId = Number.parseInt(req.params.id, 10);
  const data = req.body || {};
  res.json({
    id: recipeId,
    title: data.title,
    time_minutes: data.time_minutes,
    price: data.price,
    link: data.link || '',
    tags: data.tags || [],
    ingredients: data.ingredients || [],
    description: data.description || '',
  });
});

app.patch('/api/recipe/recipes/:id/', (req, res) => {
  const recipeId = Number.parseInt(req.params.id, 10);
  const data = req.body || {};
  res.json({
    id: recipeId,
    title: data.title || 'Sample Recipe',
    time_minutes: data.time_minutes || 30,
    price: data.price || '10.00',
    link: data.link || '',
    tags: data.tags || [],
    ingredients: data.ingredients || [],
    description: data.description || '',
  });
});

app.delete('/api/recipe/recipes/:id/', (req, res) => {
  res.status(204).send('');
});

app.post('/api/recipe/recipes/:id/upload-image/', (req, res) => {
  const recipeId = Number.parseInt(req.params.id, 10);
  res.json({
    id: recipeId,
    image: 'http://example.com/image.jpg',
  });
});

app.get('/api/recipe/ingredients/', async (req, res, next) => {
  try {
    const ingredients = await listIngredients();
    res.json(ingredients);
  } catch (err) {
    next(err);
  }
});

app.put('/api/recipe/ingredients/:id/', (req, res) => {
  const ingredientId = Number.parseInt(req.params.id, 10);
  const { name } = req.body || {};
  res.json({
    id: ingredientId,
    name,
  });
});

app.patch('/api/recipe/ingredients/:id/', (req, res) => {
  const ingredientId = Number.parseInt(req.params.id, 10);
  const { name } = req.body || {};
  res.json({
    id: ingredientId,
    name: name || 'Sample Ingredient',
  });
});

app.delete('/api/recipe/ingredients/:id/', (req, res) => {
  res.status(204).send('');
});

app.get('/api/recipe/tags/', async (req, res, next) => {
  try {
    const tags = await listTags();
    res.json(tags);
  } catch (err) {
    next(err);
  }
});

app.put('/api/recipe/tags/:id/', (req, res) => {
  const tagId = Number.parseInt(req.params.id, 10);
  const { name } = req.body || {};
  res.json({
    id: tagId,
    name,
  });
});

app.patch('/api/recipe/tags/:id/', (req, res) => {
  const tagId = Number.parseInt(req.params.id, 10);
  const { name } = req.body || {};
  res.json({
    id: tagId,
    name: name || 'Sample Tag',
  });
});

app.delete('/api/recipe/tags/:id/', (req, res) => {
  res.status(204).send('');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Internal Server Error');
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
