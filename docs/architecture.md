# Architecture

## Tags

```
| tagId         | authorUserId | fileUniqueId | valuePartition | value   | setName | ... | animationMimeType |
|---------------|--------------|--------------|----------------|---------|---------|-----|-------------------|
| user-1#fuid-1 | user-1       | fuid-1       | val            | value-1 |         | ... | 1                 |
| user-1#fuid-1 | user-1       | fuid-1       | val            | value-2 | set-1   | ... |                   |
| user-1#fuid-1 | user-1       | fuid-1       | val            | value-3 |         | ... | 2                 |
| user-2#fuid-2 | user-2       | fuid-2       | val            | value-3 | set-2   | ... |                   |
```

HASH: `tagId`
RANGE: `value`

### Query by `authorUserId` & `fileUniqueId`

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
  KeyConditionExpression: 'setName = :setName AND authorUserId = :authorUserId'
  ExpressionAttributeValues: {
    ':setName': { S: setName },
    ':authorUserId': { S: authorUserId },
  },
})
```

> Returns many results just for an existence check

### Search by value

#### Search by all tags

HASH: `valuePartition`
RANGE: `value`

```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'valuePartition = :valuePartition AND begins_with(#value, :value)'
  ExpressionAttributeNames: {
    '#value': 'value',
  },
  ExpressionAttributeValues: {
    ':value': { S: query },
    ':valuePartition': { S: valuePartition },
  },
})
```

#### Search by user's tags

HASH: `authorUserId`
RANGE: `value`

```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'authorUserId = :authorUserId AND begins_with(#value, :value)'
  ExpressionAttributeNames: {
    '#value': 'value',
  },
  ExpressionAttributeValues: {
    ':value': { S: query },
    ':authorUserId': { S: authorUserId },
  },
})
```
