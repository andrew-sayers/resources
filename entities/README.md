# Entities data

Contains information about known sleep-related entities

# Version 1

Contains the following top-level sections:

- specialists - doctors and researchers that examine sleep
- software - programs to process sleep data
- valid_values - lists of values that are allowed for certain keys

Each top-level section contains a single `records` value.  For `specialists` and `software`, these are arrays of entries.  For `valid_values`, this is a hash of keys and lists of valid values.
