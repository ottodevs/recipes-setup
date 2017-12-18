#!/bin/sh

echo "Cette application nécessite:"
echo " - un serveur postgres (>=9.5)"
echo " - node.js (>=8)"
cat - <<EOF
Cette application nécessite:
 - une base de donnée postgres (>=9.5)
 - node.js (>=8)
 - yarn (https://yarnpkg.com/)

URL de la base postgres ? Au format postgres://[[utilisateur]@hote]/[base]
La base doit déjà être créée.
EOF

read POSTGRES

echo "Enregistrement des informations de connexion dans api/.env"
cat - > api/.env <<EOF
PG_CONNECTION=$POSTGRES
JWT_SECRET=recipes
EOF

echo "Création du schéma"
psql -q $POSTGRES < api/schema/base.sql

echo "Création des fonctions"
psql -q $POSTGRES < api/schema/functions.sql

echo "Des données de test peuvent être importées depuis la base de données de GNOME Recipes."
echo "Cela peut prendre une ou deux minutes (mais ça vaut le coup !)"

function import_data () {
  echo "Téléchargement des données des recettes"
  cd importer

  yarn

  curl https://static.gnome.org/recipes/v1/data.tar.gz > data.tar.gz
  echo "Décompression"
  tar -xf data.tar.gz

  curl https://gitlab.gnome.org/GNOME/recipes/raw/master/data/ingredients.list > data/ingredients.list

  echo "Téléchargement des images"
  curl https://s.sandhose.fr/gnome-images.tar.gz > images.tar.gz
  echo "Décompression"
  tar -xf images.tar.gz

  node index.js data images > insert.sql
  echo "Sauvegardé comme importer/insert.sql"
  psql -q $POSTGRES < insert.sql

  cd ..
}

while true; do
  read -p "Voulez-vous le faire ? [Y/n] " yn
  case $yn in
      [Yy]* ) import_data; break;;
      [Nn]* ) break;;
      * ) echo "Please answer yes or no.";;
  esac
done

echo "Compilation du client"

cd frontend
yarn
yarn build
cd ..

echo "Installation du serveur"
cd api
yarn
sh ./import.sh ../importer/images/
ln -s ../frontend/build ./client
cd ..

echo "Installation prête !"
echo "Pour lancer le serveur:"
echo "  cd api"
echo "  node index.js"
echo 
echo "Naviguez vers http://localhost:5000"
