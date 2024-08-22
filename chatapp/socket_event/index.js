import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { ref } from 'vue';
var ChatType = {
  post: 1,
  memo: 2
};
var EditType = {
  insert: 1,
  delete: 2,
  update: 3,
};

//ユーザー情報の配列
let memberList = []


// DB の初期化
// database.db を読み込んで，table を作成する
async function setupDB() {
  const db = await open({
    filename: 'database.db',
    driver: sqlite3.Database
  });
  await db.exec('CREATE TABLE IF NOT EXISTS chatList (name TEXT, data TEXT, time TEXT, room TEXT, type INTEGER)');
  return db
}
// DB に chatList のデータを挿入する
async function editDatabase(chatType, editType, name, time, room, chatStruct) {
  const db = await setupDB();
  if (!db) {
    console.log('cannot open database');
    return;
  }
  // 変数の宣言と初期化
  var newData = null, oldData = null;
  switch (editType) {
    case EditType.insert:
      newData = chatStruct.newData;
      await db.run('INSERT INTO chatList (name, data, time, room, type) VALUES (?, ?, ?, ?, ?)', name, newData, time, room, chatType).then(result => {
        console.log(`insert success: ${newData}, ${name}, ${time}, ${room}, ${chatType}`);
      }).catch(error => {
        console.log(error);
      });
      break;
    case EditType.delete:
      oldData = chatStruct.oldData;
      switch (chatType) {
        case ChatType.post:
          await db.run('DELETE FROM chatList WHERE name = ? AND data = ? AND time = ? AND room = ? AND type = ?', name, oldData, time, room, chatType).then(result => {
            console.log(`delete success: ${oldData}, ${name}, ${time}, ${room}, ${chatType}`);
          }).catch(error => {
            console.log(error);
          });
          break;
        case ChatType.memo:
          await db.run('DELETE FROM chatList WHERE name = ? AND data = ? AND time = ? AND type = ?', name, oldData, time, chatType).then(result => {
            console.log(`delete success: ${oldData}, ${name}, ${time}, ${chatType}`);
          }).catch(error => {
            console.log(error);
          });
          break;
      }
      break;
    case EditType.update:
      newData = chatStruct.newData;
      oldData = chatStruct.oldData;
      switch (chatType) {
        case chatType.post:
          await db.run('UPDATE chatList SET data = ? WHERE name = ? AND data = ? AND time = ? AND room = ? AND type = ?', newData, name, oldData, time, room, chatType).then(result => {
            console.log(`update success: ${newData}, ${name}, ${time}, ${room}, ${chatType}`);
          }).catch(error => {
            console.log(error);
          });
          break;
        case chatType.memo:
          await db.run('UPDATE chatList SET data = ? WHERE name = ? AND data = ? AND time = ? AND type = ?', newData, name, oldData, time, chatType).then(result => {
            console.log(`update success: ${newData}, ${name}, ${time}, ${chatType}`);
          }).catch(error => {
            console.log(error);
          });
          break;
      }
      break;
  }
  // const data2 = await db.all('SELECT * FROM chatList WHERE room = ?', room);
  // console.log(data2);
}
// DB のデータを読み込み，データを返す
async function initializeData(room, name) {
  const db = await setupDB();
  if (!db) {
    console.log('cannot open database');
    return { posts: [], memos: [] };
  }
  const posts = await db.all('SELECT * FROM chatList WHERE room = ? AND type = ?', room, ChatType.post);
  const memos = await db.all('SELECT * FROM chatList WHERE name = ? AND type = ?', name, ChatType.memo);

  console.log('initializeData posts', posts);
  console.log('initializeData memos', memos);


  return { posts, memos };
}
export default (io, socket) => {
  // 初期化時: クライアントからリクエストを受け取ったら，DB のデータをクライアントに送信する
  socket.on("initializeRequestEvent", (room, name) => {
    initializeData(room, name).then(({ posts, memos }) => {
      console.log('request posts', posts);
      console.log('request memos', memos);
      socket.emit("initializeReplyEvent", ({ posts, memos }));
    })
  })

  // チャットルームに参加、メッセージをクライアントに送信する
  socket.on("enterEvent", (name, room) => {
    socket.join(room)
    socket.broadcast.to(room).emit("enterEvent", name, room)
    console.log("enterEvent: ", name, room)
  })

  // 退室メッセージをクライアントに送信する
  socket.on("exitEvent", (name, room) => {
    socket.leave(room)
    socket.broadcast.to(room).emit("exitEvent", name)
  })

  // 投稿メッセージを送信するとともに， DB にデータを追加する
  socket.on("publishEvent", (room, time, name, data, type) => {
    editDatabase(type, EditType.insert, name, time, room, { newData: data });
    switch (type) {
      case ChatType.post:
        io.to(room).emit("publishEvent", time, name, data);
        break;
    }
  })
  // チャットルームのリストを取得する
  socket.on('getRooms', () => {
    const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(room => {
      return !io.sockets.adapter.sids.has(room)
    })
    socket.emit('roomList', rooms)
  })
  // チャットルームの作成
  socket.on('createRoom', (room) => {
    if (io.sockets.adapter.rooms.has(room)) {
      socket.emit('createRoomSuccess', false)
    } else {
      socket.emit('createRoomSuccess', true)
    }
  })
  // クライアントからの編集イベントを受け取る
  socket.on("editEvent", function (room, data) {
    const { index, name, time, oldData, newData, type } = data;
    editDatabase(type, EditType.update, name, time, room, { newData: newData, oldData: oldData });
    switch (type) {
      case ChatType.post:
        socket.broadcast.to(room).emit("receiveEditEvent", { index, newContent: newData });
        break;
    }
  })
  // クライアントからの削除イベントを受け取る
  socket.on("deleteEvent", function (room, data) {
    const { index, name, time, oldData, type } = data;
    editDatabase(type, EditType.delete, name, time, room, { oldData: oldData });
    switch (type) {
      case ChatType.post:
        socket.broadcast.to(room).emit("receiveDeleteEvent", { index });
        break;
    }
  })

  // socket.on('joinMember', (data) => {
  //     let userExists = false
  //     if (memberList.length === 0){
  //       socket.join(data.room);
  //       memberList.push(data);
  //       // 更新されたメンバーリストを送信
  //       io.to(data.room).emit('joinMember', data);
  //       io.to(data.room).emit('updateMemberList', memberList);
  //       socket.emit("userFlag", false)   
  //     }else{
  //       memberList.forEach((joinData) =>{
  //       if (
  //           joinData.name === data.name &&
  //           joinData.grade === data.grade &&
  //           joinData.department === data.department &&
  //           joinData.room === data.room
  //       ) {
  //           userExists = true;
  //           return;
  //       }else{
  //           userExists = false;
  //         }
  //       })
  //       if (userExists){
  //         socket.emit("userFlag", userExists)
  //         return
  //       }else{
  //         socket.join(data.room);
  //         memberList.push(data);
  //         // 更新されたメンバーリストを送信
  //         io.to(data.room).emit('joinMember', data);
  //         io.to(data.room).emit('updateMemberList', memberList);
  //         socket.emit("userFlag", userExists)
  //       }}
  //     })
      
    
    
    socket.on('joinMember', (data) => {
        socket.join(data.room);
        memberList.push(data);
        // 更新されたメンバーリストを送信
        io.to(data.room).emit('joinMember', data);
        io.to(data.room).emit('updateMemberList', memberList);
})
  
  socket.on('exitMember', (data) => {
    console.log(data)
    socket.leave(data.room);
    console.log(memberList)
    memberList = memberList.filter(member => !(
      member.name === data.name && 
      member.grade === data.grade&&
      member.department === data.department&&
      member.room === data.room
    ));
    console.log(memberList)
    
    // 更新されたメンバーリストを送信
    io.to(data.room).emit('updateMemberList', memberList);
    console.log(`${data.name}が${data.room}を退出しました`);
  });
}


