DROP TABLE IF EXISTS links;
CREATE TABLE IF NOT EXISTS links (
    `id` integer PRIMARY KEY NOT NULL,
    `url` text,
    `slug` text,
    `password` text,
    `email` text,
    `ua` text,
    `ip` text,
    `status` text,
    `hostname` text ,
    `create_time` DATE
);
DROP TABLE IF EXISTS logs;
CREATE TABLE IF NOT EXISTS logs (
    `id` integer PRIMARY KEY NOT NULL,
    `url` text ,
    `slug` text,
    `referer` text,
    `ua` text ,
    `ip` text ,
    `status` text,
    `hostname` text ,
    `create_time` DATE
);
DROP TABLE IF EXISTS banDomain;
CREATE TABLE IF NOT EXISTS banDomain (
    `id` INTEGER PRIMARY KEY NOT NULL,
    `domain` TEXT,
    `create_time` TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX links_index ON links(slug);
CREATE INDEX logs_index ON logs(slug);
CREATE UNIQUE INDEX banDomain_index ON banDomain(domain);
