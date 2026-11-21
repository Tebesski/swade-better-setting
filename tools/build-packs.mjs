import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compilePack} from "@foundryvtt/foundryvtt-cli";
import {catalog} from "./gear-catalog.mjs";

const root = fileURLToPath(new URL("../packs/", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "swade-better-setting-packs-"));
try {
  await mkdir(root, {recursive: true});
  for (const [name, {collection, documents, folders}] of Object.entries(catalog)) {
    const source = join(temp, name);
    await mkdir(source);
    for (const doc of [...folders, ...documents]) {
      const descriptor = doc.type === "Item" || doc.type === "Macro" ? "folders" : collection;
      const entry = {...doc, _key: `!${descriptor}!${doc._id}`};
      if (doc.effects) entry.effects = doc.effects.map(effect =>
        ({...effect, _key: `!items.effects!${doc._id}.${effect._id}`}));
      await writeFile(join(source, doc._id + ".json"), JSON.stringify(entry));
    }
    await compilePack(source, join(root, name));
    console.log(`Built ${name} with ${documents.length} entries.`);
  }
} finally {
  await rm(temp, {recursive: true});
}
