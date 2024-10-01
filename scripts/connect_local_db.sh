#!/bin/bash

DB_NAME="task-decomp"

# Prompt for username
read -p "Enter your PostgreSQL username: " USERNAME

# Check if the database exists
if ! psql -U "$USERNAME" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "Database $DB_NAME does not exist."
    read -p "Do you want to create it? (y/n): " CREATE_DB
    if [[ $CREATE_DB =~ ^[Yy]$ ]]; then
        createdb -U "$USERNAME" "$DB_NAME"
        echo "Database $DB_NAME created successfully."
    else
        echo "Database creation skipped. Exiting."
        exit 1
    fi
fi

# Connect to the database
echo "Connecting to database $DB_NAME..."
psql -U "$USERNAME" -d "$DB_NAME"
