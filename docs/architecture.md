# Architecture

## Tags

```
| tagId         | queryId     | valueHash | authorUserId | fileUniqueId | value   | setName | ... |
|---------------|-------------|-----------|--------------|--------------|---------|---------|-----|
| user-1#fuid-1 | user-1#val  | <hash>    | user-1       | fuid-1       | value-1 | set-1   | ... |
| user-1#fuid-1 | #val        | <hash>    | user-1       | fuid-1       | value-1 | set-1   | ... |
| user-1#fuid-1 | user-1#val  | <hash>    | user-1       | fuid-1       | value-2 | set-1   | ... |
| user-1#fuid-1 | #val        | <hash>    | user-1       | fuid-1       | value-2 | set-1   | ... |
| user-1#fuid-1 | user-1#val  | <hash>    | user-1       | fuid-1       | value-3 | set-1   | ... |
| user-1#fuid-1 | #val        | <hash>    | user-1       | fuid-1       | value-3 | set-1   | ... |
| user-2#fuid-2 | user-1#val  | <hash>    | user-2       | fuid-2       | value-3 | set-2   | ... |
| user-2#fuid-2 | #val        | <hash>    | user-2       | fuid-2       | value-3 | set-2   | ... |

tagId = authorUserId + fileUniqueId
queryId = partially(value) + optional(authorUserId)
valueHash = hash(value + optional(authorUserId))
```

### Query by `authorUserId` & `fileUniqueId`

HASH: `tagId`

```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'tagId = :tagId'
  ExpressionAttributeValues: {
    ':tagId': { S: `${authorUserId}#${fileUniqueId}` },
  },
})
```
### Delete items from previous operation

HASH: `tagId`
RANGE: `valueHash`

```js
new BatchWriteItemCommand({
  RequestItems: {
    [tableName]: Items.map(item => ({
      DeleteRequest: {
        Key: {
          tagId: item.tagId,
          valueHash: item.valueHash,
        }
      }
    }))
  }
})
```

### Query tag status

HASH: `setName`
RANGE: `authorUserId`

#### Tagged by anyone
```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'setName = :setName'
  ExpressionAttributeValues: {
    ':setName': { S: setName },
  },
})
```

> Returns too many results just for an existence check

#### Tagged by user
```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'setName = :setName AND begins_with(authorUserId, :authorUserId)'
  ExpressionAttributeValues: {
    ':setName': { S: setName },
    ':authorUserId': { S: authorUserId + '#' },
  },
})
```

> Returns many results just for an existence check

### Search by value

HASH: `queryId`
RANGE: `value`

Search by all tags:
```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'queryId = :queryId AND begins_with(#value, :value)'
  ExpressionAttributeNames: {
    '#value': 'value',
  },
  ExpressionAttributeValues: {
    ':value': { S: query },
    ':queryId': { S: authorUserId ? `${query.slice(0, 2)}#${authorUserId}` : query.slice(0,2) },
  },
})
```

Search by user's tags:
```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'queryId = :queryId AND begins_with(#value, :value)'
  ExpressionAttributeNames: {
    '#value': 'value',
  },
  ExpressionAttributeValues: {
    ':value': { S: query },
    ':queryId': { S: `${query.slice(0, 2)}#${authorUserId}` },
  },
})
```
