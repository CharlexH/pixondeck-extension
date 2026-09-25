import { test } from "node:test";
import assert from "node:assert/strict";
import { favoriteEntry, reconcileFavorites, type SavedPrompt } from "./favorites.ts";
import { emptyHistory } from "./task-history.ts";
const item: SavedPrompt = { id:"item",prompt:"Cloud original",title:"",revision:1,originalWidth:400,originalHeight:200,thumbnailUrl:null,createdAt:"2024-01-01T00:00:00.000Z",updatedAt:"2024-01-01T00:00:00.000Z" };
test("old cloud favorites are not pruned by the recent seven-day retention", () => {
  const result = reconcileFavorites(emptyHistory(), [item]);
  assert.equal(result.entries.length,1); assert.equal(result.entries[0].draft,item.prompt);
});
test("dirty favorite keeps its own editor object across refresh, without mutating source or cloud text", () => {
  const entry = favoriteEntry(item); entry.draft="My edit";entry.edited=true;
  const result = reconcileFavorites({...emptyHistory(),entries:[entry],selectedId:item.id},[{...item,prompt:"Other device edit",revision:2}]);
  assert.equal(result.entries[0],entry);assert.equal(entry.draft,"My edit"); assert.equal(item.prompt,"Cloud original");
});
test("server deletion retains an unsaved cloud draft for explicit resolution",()=>{
  const entry = favoriteEntry(item); entry.draft="Unsaved";entry.edited=true;
  const result = reconcileFavorites({...emptyHistory(),entries:[entry],selectedId:item.id},[]);
  assert.equal(result.entries[0],entry); assert.equal(result.selectedId,item.id);
});
