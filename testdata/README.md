# Test Data Backup

This directory contains a direct Mongo export of the live test data from the remote server.

Included collections:
- `companies`
- `users`
- `accounts`
- `media`
- `identities`
- `startups`
- `jobs`
- `products`
- `comments`
- `addresses`
- `carts`
- `orders`
- `transactions`
- `pages`
- `forms`
- `form-submissions`
- `redirects`
- `subscribers`
- `notification-subscriptions`
- `reports`
- `information-requests`
- `searches`
- `posts`
- `company-likes`
- `identity-likes`
- `venture-likes`
- `job-likes`
- `product-likes`
- `post-likes`
- `comment-likes`
- `syndications`

Omitted on purpose:
- `_versions` collections
- auth/system collections like `sessions`, `verifications`, `oauth*`, and Payload internal collections
- empty collections were exported once and then pruned because they contained only `[]`

These files are raw `mongoexport` output. They keep Mongo fields like `_id`, dates, and `__v` intact so the backup stays faithful to the source data.

Test login:
- Email: `dorian.sternvukotic@gmail.com`
- Password: `test-password`
