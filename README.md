# Site de recettes – Projet de l'UE BDD2/Web

Dans dossier, vous trouverez:

 - `setup.sh`, qui installe les dépendances du client et du serveur, et importe les données de test
 - `api/`, le code du backend, avec le schéma de base de données
 - `frontend/`, le frontend
 - `importer/`, le script d'import de la base de GNOME Recipes

Version en ligne disponible: https://recipes.sandhose.fr/

Dépôt Git: https://github.com/sandhose/recipes-setup (à cloner avec `--recursive`)

## Backend

Le backend consiste en une API [GraphQL](http://graphql.org/), auto-générée par introspection du schéma PostgreSQL, via [PostGraphQL](https://github.com/postgraphql/postgraphql).

L'essentiel du backend (création des recettes, authentification, récupération des données…) se trouve donc en base, dans des fonctions postgres.
Ces fonctions sont définies dans le fichier `api/schema/functions.sql`.

## API

L'API peut être explorée sur [`/graphiql`](https://recipes.sandhose.fr/graphiql).
Exemple de requête intéressante, la liste des recettes avec leur nombre d'ingrédients d'un utilisateur:

```graphiql
{
  profileById(id: 3) {
    fullName
    recipes {
      totalCount
      nodes {
        name
        ingredients {
          totalCount
        }
      }
    }
  }
}
```


## Frontend

Le frontend est une appli [React](https://reactjs.org/), avec la bibliothèque [Apollo](https://apollographql.com/docs/react/) pour interagir avec l'API, et l'*UI Kit* [Semantic-UI](https://react.semantic-ui.com).
Le routage est fait avec la bibliothèque [`react-router`](https://reacttraining.com/react-router/).

Certains composants logiques sont gérés avec des fonctions de la bibliothèque utilitaire [`recompose`](https://github.com/acdlite/recompose).

Je n'ai malheureusement pas eu le temps de plus commenter mon code.


## À faire

La base a été reprise quasiment à l'identique par rapport à la première partie du projet (simplement, adaptée pour postgres).

Donc en base, les plannings, les menus, les frigos, les régimes alimentaires sont là et peuvent être requêtés, mais le frontend n'a pas encore été fait pour ces choses là.

Pareil pour la création de recettes, les fonctions postgres sont là, mais le frontend n'est pas prêt.
