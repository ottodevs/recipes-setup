const bcrypt = require("bcrypt");
const ini = require("ini");
const fs = require("fs");
const uniq = require("uniq");
const path = require("path");
const crypto = require("crypto");
const mime = require("mime");

const stringify = val =>
  val === null
    ? "NULL"
    : `'${val.replace(/'/g, "''").replace(/\&/g, "' || chr(38) || '")}'`;

const orNull = val => (val === -1 || val === null ? "NULL" : val);

const load = database =>
  Object.entries(
    ini.parse(
      fs
        .readFileSync(`${process.argv[2]}/${database}.db`, "utf-8")
        .replace(/;/g, "\\;")
    )
  ).map(([id, obj]) => ({ id, ...obj }));

const recipesData = load("recipes");
const chefsData = load("chefs");
const ingredientsList = fs
  .readFileSync(`${process.argv[2]}/ingredients.list`, "utf-8")
  .split("\n")
  .map(name => ({ name }));

// Categories
const ex = key => uniq(recipesData.map(obj => obj[key]).filter(n => !!n));
const parentCategories = ["Cuisine", "Season", "Category"];
const cuisine = ex("Cuisine");
const season = ex("Season");
const category = ex("Category");

const catMap = (parent, recipesData) =>
  recipesData.map(name => ({ parent, name }));

const allCategories = [
  ...catMap(null, parentCategories),
  ...catMap(0, cuisine),
  ...catMap(1, season),
  ...catMap(2, category)
];
const resolveCategory = search =>
  allCategories.findIndex(
    ({ name }) => name.toLowerCase() == search.toLowerCase()
  );

const resolveCategories = arr =>
  arr
    .filter(i => !!i)
    .map(resolveCategory)
    .filter(index => index != -1);

/* From src/gr-diets.h
 *
 * typedef enum { 
 *         GR_DIET_GLUTEN_FREE   =  1,
 *         GR_DIET_NUT_FREE      =  2,
 *         GR_DIET_VEGAN         =  4,
 *         GR_DIET_VEGETARIAN    =  8,
 *         GR_DIET_MILK_FREE     = 16
 * } GrDiets;
 */
const diets = ["Gluten free", "Nut free", "Vegan", "Vegetarian", "Milk free"];
const parseDiet = diet =>
  diets.reduce(
    (acc, name, index) => ((diet >> index) & 0b1 ? [...acc, index] : acc),
    []
  );
const parseDietInvert = diet =>
  diets.reduce(
    (acc, name, index) => ((diet >> index) & 0b1 ? acc : [...acc, index]),
    []
  );

// Media
const imagePath = p => path.join(process.argv[3], p);
const imageExists = p => fs.existsSync(imagePath(p));

const sha1 = path => {
  const hasher = crypto.createHash("sha1");
  hasher.update(fs.readFileSync(path));
  return hasher.digest("hex");
};

const picturePath = (id, image) => {
  if (!image) return null;
  if (!image.includes(".")) image += ".jpg";
  image = `${id}/${image}`;
  return imageExists(image) ? image : null;
};

// Author and stuff
const users = chefsData.filter(c => !!c.Name).map((c, index) => ({
  name: c.id,
  picture: c.Image || null,
  fullname: c.Fullname || null,
  description: c.Description || null,
  email: `${c.id}@gnome.org`,
  picture: picturePath(c.id, (c.Image || "").replace("images/", "")),
  fridgeId: index
}));

const resolveAuthor = search =>
  users.findIndex(({ name }) => name.toLowerCase() == search.toLowerCase());

// Recipes
const timerMap = {
  "15 minutes": { from: 15, to: 15 },
  "15 to 30 minutes": { from: 15, to: 30 },
  "20 minutes": { from: 20, to: 20 },
  "30 to 45 minutes": { from: 30, to: 45 },
  "40 minutes": { from: 40, to: 40 },
  "45 minutes to an hour": { from: 45, to: 60 },
  "Less than 15 minutes": { to: 15 },
  "More than an hour": { from: 60 }
};

const mapTime = (time, type) =>
  time && timerMap[time] ? { ...timerMap[time], type } : null;

const parseTimerValue = timer => {
  const m = /(\d\d):(\d\d):(\d\d)/.exec(timer);
  if (m === null) return null;
  return parseInt(m[3]) + 60 * (parseInt(m[2]) + 60 * parseInt(m[1]));
};

const parseTimer = timer => {
  const m = /((?:\d\d:){2}\d\d)(?:,(\w*))?/g.exec(timer);
  if (m === null) return null;
  const val = parseTimerValue(m[1]);
  return { from: val, to: val, type: m[2] || null };
};

const parseStep = step => {
  const stepRe = /\[([^:]*):([^\]]*)\]/g;
  const obj = {
    text: step.replace(
      stepRe,
      (_, key, value) => (key === "temperature" ? value : "")
    )
  };
  let matches;
  while ((matches = stepRe.exec(step)) != null) {
    obj[matches[1]] = matches[2];
  }

  if (obj.timer) {
    obj.timer = parseTimer(obj.timer);
  }

  return obj;
};

const recipes = recipesData
  .map(obj => ({
    name: obj.Name || null,
    author: obj.Author || "",
    categories: resolveCategories([obj.Cuisine, obj.Season, obj.Category]),
    description: obj.Description || null,
    ingredients: (obj.Ingredients || "")
      .split("\\n")
      .map(i => i.replace(/\\t/g, "\t").split("\t"))
      .map(([quantity, unit, name]) => ({
        quantity: quantity || null,
        unit: unit || null,
        name
      }))
      .filter(({ name }) => !!name),
    steps: (obj.Instructions || "")
      .split("\\n")
      .filter(s => !!s)
      .map(parseStep),
    serves: obj.Serves || null,
    medias: (obj.Images || "")
      .split(";")
      .filter(i => !!i)
      .map(p => picturePath(obj.id, p)),
    timers: [
      mapTime(obj.PrepTime, "Preparation"),
      mapTime(obj.CookTime, "Cook")
    ].filter(i => !!i),
    diets: parseInt(obj.Diets) || 31,
    calories: Math.floor(Math.random() * 30) * 30
  }))
  .filter(({ name, author }) => name && author);

const ingredients = uniq(
  ingredientsList
    .concat(...recipes.map(({ ingredients }) => ingredients))
    .filter(({ name }) => !!name)
    .map(({ name }) => name.trim()),
  (a, b) => a.toLowerCase().localeCompare(b.toLowerCase())
);

const medias = []
  .concat(users.map(u => u.picture), ...recipes.map(r => r.medias))
  .filter(i => !!i)
  .map(path => ({
    path,
    hash: sha1(imagePath(path)),
    mime: mime.getType(path)
  }));

const lookupMedia = search =>
  search && medias.findIndex(m => m.path.toLowerCase() == search.toLowerCase());

const steps = [].concat(...recipes.map(r => r.steps));
const getStepId = search => steps.findIndex(step => step === search);

const qtyMap = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅜": 3 / 8,
  "1/2": 1 / 2
};

const parseQty = (input, serves) =>
  input &&
  input
    .split(" ")
    .filter(i => !!i)
    .map(n => {
      if (n in qtyMap) return qtyMap[n];
      return parseFloat(n) / serves;
    })
    .reduce((a, b) => a + b, 0);

const timers = []
  .concat(steps.map(({ timer }) => timer), ...recipes.map(r => r.timers))
  .filter(t => t && (t.from || t.to));

const resolveIngredient = search =>
  ingredients.findIndex(
    ingredient => ingredient.toLowerCase() == search.toLowerCase()
  );

const ingredientDietIncompat = recipes.map(r => ({
  diets: parseDiet(r.diets),
  notDiets: parseDietInvert(r.diets),
  ingredients: r.ingredients.map(({ name }) => resolveIngredient(name))
}));

const dietIntolerances = ingredients.map(
  (_, index) =>
    new Set(
      ingredientDietIncompat.reduce(
        (set, { notDiets, ingredients }) =>
          ingredients.includes(index) ? [...notDiets, ...set] : set,
        []
      )
    )
);
dietIntolerances.forEach((set, index) =>
  ingredientDietIncompat.forEach(({ diets, ingredients }) => {
    if (ingredients.includes(index)) {
      for (let d of diets) {
        set.delete(d);
      }
    }
  })
);

const fridgesSql = users
  .map(({ fridgeId }) =>
    ingredients
      .concat()
      .sort(_ => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 30))
      .map(
        ingredient => `INSERT INTO INGREDIENT_LIST_INGREDIENT 
  VALUES (${fridgeId}, ${resolveIngredient(ingredient)}, ${Math.floor(
          Math.random() * 10000
        ) / 10}, 'g');`
      )
      .join("\n")
  )
  .join("\n");

// --- Plannings ---

const plannings = Array.from(
  new Array(users.length * 2),
  () => Math.floor(Math.random() * users.length) % users.length
).map(userId => ({
  name: `${users[userId].name}'s random planning`,
  userId,
  expiryDateDiff: Math.floor((Math.random() - 0.5) * 100),
  menus: Array.from(
    new Array(Math.ceil(Math.random() * 5)),
    () => 1
  ).map((_, i) => ({
    name: `${users[userId].name} menu ${i}`,
    recipes: recipes
      .concat([])
      .sort(() => Math.random() - 0.5)
      .splice(0, Math.ceil(Math.random() * 5))
      .map(r => recipes.indexOf(r))
  }))
}));

const menus = [].concat(...plannings.map(p => p.menus));

const menuRecipesSql = (menu, recipes) =>
  recipes
    .map(
      (recipe, position) =>
        `INSERT INTO MENU_RECIPE (MENU_ID, RECIPE_ID, POSITION) VALUES (${menu}, ${recipe}, ${position});`
    )
    .join("\n");
const menusSql = menus
  .map(
    ({ name, recipes }, index) => `INSERT INTO MENU (ID, NAME)
  VALUES (${index}, ${stringify(name)});
${menuRecipesSql(index, recipes)}
`
  )
  .join("\n");

const planningsMenuSql = (planning, menus) =>
  menus
    .map(
      (
        m,
        position
      ) => `INSERT INTO PLANNING_MENU (PLANNING_ID, MENU_ID, POSITION)
  VALUES (${planning}, ${menus.indexOf(m)}, ${position});`
    )
    .join("\n");

const planningsSql = plannings
  .map(
    (
      { name, userId, expiryDateDiff, menus },
      index
    ) => `INSERT INTO PLANNING (ID, NAME, PROFILE_ID, EXPIRY_DATE)
  VALUES (${index}, ${stringify(name)}, 
          ${userId}, now() + INTERVAL '${expiryDateDiff} days');
${planningsMenuSql(index, menus)}
`
  )
  .join("\n");

// --- Ingredient Categories ---
const ingredientCategories = Array.from(
  new Array(30),
  (_, i) => `Category ${i}`
);

const genCategory = index =>
  ingredients
    .concat()
    .sort(_ => Math.random() - 0.5)
    .slice(0, Math.floor(Math.random() * 30))
    .map(
      ingredient => `INSERT INTO INGREDIENT_CAT_CONTENT 
  VALUES (${resolveIngredient(ingredient)}, ${index});`
    )
    .join("\n");

const ingredientCategoriesSql = ingredientCategories
  .map(
    (name, i) =>
      `INSERT INTO INGREDIENT_CATEGORY (ID, NAME)
  VALUES (${i}, ${stringify(name)});
${genCategory(i)}
`
  )
  .join("\n");

// ----------
const mediaSql = medias
  .map(
    ({ path, hash, mime }, index) =>
      `INSERT INTO MEDIA (ID, HASH, NAME, MIME) VALUES (${index}, decode('${hash.toUpperCase()}', 'hex'), ${stringify(
        path
      )}, '${mime}');`
  )
  .join("\n");

const dietsSql = diets
  .map(
    (name, index) =>
      `INSERT INTO DIET (ID, NAME) VALUES (${index}, ${stringify(name)});`
  )
  .join("\n");

const usersSql = users
  .map(
    ({ name, fullname, description, email, picture, fridgeId }, index) =>
      `INSERT INTO PROFILE (ID, USERNAME, EMAIL, PASSWORD, FULL_NAME, BIOGRAPHY, PICTURE_ID, FRIDGE_ID) 
  VALUES (
    ${index}, ${stringify(name)}, 
    ${stringify(email)}, 
    ${stringify(bcrypt.hashSync(name, 8))},
    ${stringify(fullname)}, 
    ${stringify(description)},
    ${orNull(lookupMedia(picture))}, ${fridgeId}
  );`
  )
  .join("\n");

const catSql = allCategories
  .map(
    ({ parent, name }, index) =>
      `INSERT INTO CATEGORY (ID, NAME, PARENT_ID) VALUES (${index}, '${name}', ${orNull(
        parent
      )});`
  )
  .join("\n");

const ingredientsSql = ingredients
  .map(
    (name, index) =>
      `INSERT INTO INGREDIENT (ID, NAME) VALUES (${index}, ${stringify(name)});`
  )
  .join("\n");

const dietsIntoleranceSql = dietIntolerances
  .map((diets, index) =>
    Array.from(diets)
      .map(
        d =>
          `INSERT INTO DIET_INTOLERANCE (DIET_ID, INGREDIENT_ID) VALUES (${d}, ${index});`
      )
      .join("\n")
  )
  .filter(i => !!i)
  .join("\n");

const timersSql = timers
  .map(
    ({ from, to, type }, index) =>
      `INSERT INTO TIMER (ID, TIME_MIN, TIME_MAX, TYPE) 
  VALUES (${index}, ${from || "NULL"}, ${to || "NULL"}, ${stringify(type)});`
  )
  .join("\n");

const ingredientListIdsSql = Array.from(
  new Array(recipes.length + users.length),
  (_, i) => `INSERT INTO INGREDIENT_LIST (ID) VALUES (${i});`
).join("\n");

// -----
const ingredientListSql = (listId, ingredients, serves) =>
  ingredients
    .map(
      ({ name, unit, quantity }) =>
        `-- ${quantity || ""} ${unit || ""} ${name}
INSERT INTO INGREDIENT_LIST_INGREDIENT VALUES (
  ${listId}, ${resolveIngredient(name)}, 
  ${parseQty(quantity, serves) || "DEFAULT"}, ${stringify(unit)}
);`
    )
    .join("\n\n");

const recipeCategoriesSql = (recipe, categories) =>
  categories
    .map(
      id =>
        `INSERT INTO RECIPE_CATEGORY (RECIPE_ID, CATEGORY_ID) 
  VALUES (${recipe}, ${id}); -- ${allCategories[id].name}`
    )
    .join("\n");

const recipeTimerSql = (recipe, rTimers) =>
  rTimers
    .map(
      t =>
        `INSERT INTO RECIPE_TIMER (RECIPE_ID, TIMER_ID)
  VALUES (${recipe}, ${timers.indexOf(t)});`
    )
    .join("\n");

const recipeMediaSql = (recipe, medias) =>
  medias
    .map(
      path =>
        `INSERT INTO RECIPE_MEDIA (MEDIA_ID, RECIPE_ID) VALUES (${lookupMedia(
          path
        )}, ${recipe});`
    )
    .join("\n");

const getStepMedia = (mediaIndex, medias) =>
  mediaIndex ? medias[parseInt(mediaIndex)] : null;

const stepsSql = (recipeId, steps, medias) =>
  steps
    .map(
      (step, index) =>
        `INSERT INTO STEP (ID, RECIPE_ID, DESCRIPTION, POSITION, MEDIA_ID, TIMER_ID) 
  VALUES (
    ${getStepId(step)}, ${recipeId}, 
    ${stringify(step.text)}, 
    ${index}, ${orNull(lookupMedia(getStepMedia(step.image, medias)))},
    ${orNull(timers.indexOf(step.timer))}
  );`
    )
    .join("\n\n");

const recipesSql = recipes
  .map(
    (
      {
        name,
        author,
        categories,
        description,
        ingredients,
        medias,
        steps,
        serves,
        timers,
        calories
      },
      index
    ) => `
-- (ingredients)
${ingredientListSql(index + users.length, ingredients, serves)}

INSERT INTO RECIPE (ID, NAME, DESCRIPTION, AUTHOR_ID, INGREDIENT_LIST_ID, SERVES, CALORIES) VALUES (
  ${index},
  ${stringify(name)},
  ${stringify(description)},
  ${resolveAuthor(author)}, -- ${author}
  ${index + users.length}, -- list id
  ${serves}, -- persons
  ${calories} -- calories
);

-- (timers)
${recipeTimerSql(index, timers)}

-- (medias)
${recipeMediaSql(index, medias)}

-- (steps)
${stepsSql(index, steps, medias)}

-- (categories)
${recipeCategoriesSql(index, categories)}
`
  )
  .join("\n");

const render = () =>
  console.log(`
SET search_path TO internal,api;

-- Delete old data
DELETE FROM recipe_media;
DELETE FROM menu_recipe;
DELETE FROM planning_menu;
DELETE FROM planning;
DELETE FROM recipe_timer;
DELETE FROM step;
DELETE FROM recipe_category;
DELETE FROM diet_intolerance;
DELETE FROM ingredient_list_ingredient;
DELETE FROM ingredient;
DELETE FROM recipe;
DELETE FROM profile;
DELETE FROM ingredient_list;
DELETE FROM category;
DELETE FROM media;
DELETE FROM timer;
DELETE FROM diet;
DELETE FROM menu;

${mediaSql}

${dietsSql}

${ingredientListIdsSql}
ALTER SEQUENCE ingredient_list RESTART WITH ${users.length + recipes.length};

${usersSql}
ALTER SEQUENCE profile_id_seq RESTART WITH ${users.length};

${catSql}

${timersSql}

${ingredientsSql}

${dietsIntoleranceSql}

${"" /*ingredientCategoriesSql*/}
${fridgesSql}

${recipesSql}
ALTER SEQUENCE recipe_id_seq RESTART WITH ${recipes.length};

${menusSql}

${planningsSql}`);
const r = () => /(\\t|\t)/g;

render();
