#!/bin/sh

echo "Looking for the database ..."
while ! pg_isready -q -d $STORAGE_URI
do
  echo "Waiting for database."
  sleep 2
done
echo "Found database."
echo "Starting the application..."

npm run start:prod