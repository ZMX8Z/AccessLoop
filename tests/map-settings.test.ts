import assert from 'node:assert/strict';
import test from 'node:test';
import { publicMapSettings } from '../src/server/map-settings';
test('map settings have an attributed HTTPS OSM default and never expose server secrets',()=>{
 const config=publicMapSettings({DATABASE_URL:'secret',ACCESSIBILITY_CLOUD_APP_TOKEN:'secret'});
 assert.equal(config.tileUrl,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
 assert.equal(config.attributionUrl,'https://www.openstreetmap.org/copyright');
 assert.equal(JSON.stringify(config).includes('secret'),false);
});
test('custom basemaps require a safe XYZ template and their own visible attribution',()=>{
 assert.deepEqual(publicMapSettings({MAP_TILE_URL:'https://maps.example/{z}/{x}/{y}.png',MAP_ATTRIBUTION:'Map provider',MAP_ATTRIBUTION_URL:'https://maps.example/terms'}),{tileUrl:'https://maps.example/{z}/{x}/{y}.png',attribution:'Map provider',attributionUrl:'https://maps.example/terms'});
 for(const env of [
  {MAP_TILE_URL:'http://maps.example/{z}/{x}/{y}'},
  {MAP_TILE_URL:'https://maps.example/static.png'},
  {MAP_TILE_URL:'https://maps.example/{z}/{x}/{y}.png'},
  {MAP_TILE_URL:'https://secret:password@maps.example/{z}/{x}/{y}.png',MAP_ATTRIBUTION:'Provider',MAP_ATTRIBUTION_URL:'https://maps.example/'},
  {MAP_ATTRIBUTION:'<script>evil()</script>'},
  {MAP_ATTRIBUTION_URL:'javascript:alert(1)'},
 ]) assert.throws(()=>publicMapSettings(env));
});
