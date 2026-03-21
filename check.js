const hashes = (require("./hashTable.json"))
const rc = {}
for (let i = 0; i < hashes.length; i++){
    if (!rc[hashes[i].hash]) rc[hashes[i].hash] = [hashes[i].name]
    else rc[hashes[i].hash].push(hashes[i].name)
}
console.table(rc)