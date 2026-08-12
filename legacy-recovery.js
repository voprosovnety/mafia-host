(function () {
  "use strict";

  var status = document.getElementById("status");
  var details = document.getElementById("details");
  var importButton = document.getElementById("import");
  var games = [];
  var missingGames = [];

  function setError(message) {
    status.textContent = message;
    status.className = "error";
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB недоступна"));
        return;
      }
      var request = indexedDB.open("mafia-host", 1);
      request.addEventListener("success", function () { resolve(request.result); });
      request.addEventListener("error", function () { reject(request.error); });
    });
  }

  function readGames(database) {
    return new Promise(function (resolve, reject) {
      if (!database.objectStoreNames.contains("games")) {
        resolve([]);
        return;
      }
      var transaction = database.transaction("games", "readonly");
      var request = transaction.objectStore("games").getAll();
      request.addEventListener("success", function () { resolve(request.result); });
      request.addEventListener("error", function () { reject(request.error); });
    });
  }

  function importGame(game) {
    return fetch("http://127.0.0.1:8000/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(game),
    }).then(function (response) {
      if (response.ok) return "imported";
      if (response.status === 409) return "duplicate";
      return response.json().then(function (payload) {
        throw new Error(payload.error || "Ошибка SQLite: " + response.status);
      });
    });
  }

  importButton.addEventListener("click", function () {
    importButton.disabled = true;
    status.textContent = "Переношу игры…";
    Promise.all(missingGames.map(importGame)).then(function (results) {
      var imported = results.filter(function (result) { return result === "imported"; }).length;
      var duplicates = results.length - imported;
      status.innerHTML = "Готово: добавлено <strong>" + imported + "</strong>, уже были в SQLite: <strong>" + duplicates + "</strong>.";
      details.textContent = "Теперь обновите страницу Mafia Host и откройте «Историю».";
    }).catch(function (error) {
      setError("Не удалось перенести игры: " + error.message);
      importButton.disabled = false;
    });
  });

  Promise.all([
    openDatabase().then(readGames),
    fetch("http://127.0.0.1:8000/api/games").then(function (response) {
      if (!response.ok) throw new Error("SQLite-сервер недоступен");
      return response.json();
    }),
  ]).then(function (results) {
    var storedGames = results[0];
    var sqliteGames = Array.isArray(results[1].games) ? results[1].games : [];
    games = storedGames.filter(function (game) {
      return game && typeof game === "object" && typeof game.gameId === "string" && Array.isArray(game.players);
    });
    missingGames = games.filter(function (game) {
      return !sqliteGames.some(function (sqliteGame) {
        return sqliteGame.gameId === game.gameId ||
          (sqliteGame.date === game.date && sqliteGame.time === game.time);
      });
    });
    status.innerHTML = "В старой базе найдено <strong>" + games.length + "</strong> игр. " +
      "В SQLite уже есть <strong>" + sqliteGames.length + "</strong>, восстановить нужно: <strong>" + missingGames.length + "</strong>.";
    details.textContent = games.map(function (game) {
      var missing = missingGames.indexOf(game) !== -1;
      return (missing ? "ВОССТАНОВИТЬ  " : "УЖЕ ЕСТЬ     ") +
        (game.date || "без даты") + " " + (game.time || "без времени") + " — " + game.gameId;
    }).join("\n");
    importButton.disabled = missingGames.length === 0;
    document.title = "Восстановить игр: " + missingGames.length + " · Mafia Host";
  }).catch(function (error) {
    setError("Не удалось прочитать старую базу: " + error.message);
  });
}());
