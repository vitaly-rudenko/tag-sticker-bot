# Architecture

## Tags

1. Store tags for sticker  
  Operation: `BatchWriteItem`  

### Access patterns

1. Search by `value` (& optionally `authorUserId`) – without duplicates  
  Operation: `Query`  
2. Remove by `fileUniqueId` & `authorUserId` – to replace with another tag for that sticker  
  Operation: `BatchWriteItem`
3. Query status – whether a sticker is tagged (by me) or not  
  Operation: `BatchGetItem`  
4. (Not implemented) Search by `authorUserId` – to list tags created by user

```
Tag {
  setName: S
  fileUniqueId: S
  fileId: S
  authorUserId: S
  value: S
}
```

Unique ID: `(authorUserId, fileUniqueId, value)`

HASH: `authorUserId` + `fileUniqueId`  
RANGE: `value`

```
| id            | authorUserId | fileUniqueId | value   | setName | fileId |
|---------------|--------------|--------------|---------|---------|--------|
| user-1#fuid-1 | user-1       | fuid-1       | value-1 | set-1   | *      |
| user-1#fuid-1 | #            | fuid-1       | value-1 | set-1   | *      |
| user-1#fuid-1 | user-1       | fuid-1       | value-2 | set-1   | *      |
| user-1#fuid-1 | #            | fuid-1       | value-2 | set-1   | *      |
| user-1#fuid-2 | user-1       | fuid-2       | value-3 | set-2   | *      |
| user-1#fuid-2 | #            | fuid-2       | value-3 | set-2   | *      |
```

#### 1. Search by value

> Index: **GSI**

HASH: `authorUserId`
RANGE: `value`

Search by `value` (and optionally by `authorUserId`):
```js
const { Items } = new QueryCommand({
  KeyConditionExpression: 'authorUserId = :authorUserId AND begins_with(#value, :value)'
  ExpressionAttributeNames: {
    '#value': 'value',
  },
  ExpressionAttributeValues: {
    ':value': { S: query },
    ':authorUserId': { S: authorUserId || '#' },
  },
})
```

#### 2. Remove

> Without index

HASH: `id`  

```js
const { Items } = new QueryCommand({
  KeyConditionExpression: '#id = :id',
  ExpressionAttributeNames: {
    '#id': 'id',
  },
  ExpressionAttributeValues: {
    ':id': { S: `${authorUserId}#${fileUniqueId}` }
  },
})

new BatchWriteItemCommand({
  RequestItems: {
    [tableName]: Items.map(item => ({
      DeleteRequest: {
        Key: {
          id: item.id,
          value: item.value,
        }
      }
    }))
  }
})
```

#### 3. Query status

> Index: **GSI**

HASH: `setName`  
RANGE: `authorUserId`

```js
const { Items } = new BatchGetItemCommand({
  RequestItems: {
    [tableName]: {
      Keys: {
        setName: { S: setName },
        authorUserId: { S: authorUserId || '#' },
      }
    }
  }
})

const { Items } = new QueryCommand({
  KeyConditionExpression: 'setName = :setName AND authorUserId = :authorUserId'
  ExpressionAttributeValues: {
    ':setName': { S: setName },
    ':authorUserId': { S: authorUserId || '#' },
  },
})
```

#### 4. Search by author

Index: **GSI**

HASH*: `authorUserId`  
RANGE*: `setName`

```js
const { Items } = new QueryCommand({
  KeyConditionExpression: setName
    ? 'authorUserId = :authorUserId AND setName = :setName'
    : 'authorUserId = :authorUserId'
  ExpressionAttributeValues: {
    ':authorUserId': authorUserId,
    ':setName': setName,
  },
})
```
