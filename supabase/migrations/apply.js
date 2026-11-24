const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

// Resolve pg from Apsurn/node_modules
const { Client } = require('C:/Users/USER/Documents/Projects/Apsurn/node_modules/pg');

const connectionString = 'postgresql://postgres.kgoyzbdvwasjzlsfxivp:Gn4CoJmz7Bs0XaB4@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  const before = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables before reset (' + before.rows.length + '):', before.rows.map(r => r.tablename).join(', '));

  const sql = fs.readFileSync(path.join(__dirname, '0001_init_gtm_schema.sql'), 'utf8');
  await client.query(sql);

  // Also reload PostgREST schema cache so Supabase JS client immediately sees the new tables
  await client.query("NOTIFY pgrst, 'reload schema'");

  const after = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables after reset & restructure (' + after.rows.length + '):', after.rows.map(r => r.tablename).join(', '));

  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
