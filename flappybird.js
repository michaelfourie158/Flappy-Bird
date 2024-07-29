// board
let board;
let boardWidth = 360;
let boardHeight = 640;
let context;

// bird
let birdWidth = 34;
let birdHeight = 24;
let birdX = boardWidth / 8;
let birdY = boardHeight / 2;
let birdImg;

let bird = {
    x: birdX,
    y: birdY,
    width: birdWidth,
    height: birdHeight
}

let pipeArray = [];
let pipeWidth = 64;
let pipeHeight = 512;
let pipeX = boardWidth;
let pipeY = 0;

let topPipeImg;
let bottomPipeImg;

// physics
let velocityX = -1; // pipes move left
let velocityY = 0; // bird jump speed
let gravity = 0.1;

let gameOver = false;

let score = 0;

let gameOverSound = document.getElementById("gameOverSound");

let hasGameOverSoundPlayed = false;

let highScore = localStorage.getItem("highScore") || 0;

let weather = "none"; // options: "none", "rain", "snow", "wind"
let weatherInterval;


window.onload = function () {
    board = document.getElementById("board");
    resizeCanvas();
    context = board.getContext("2d"); // drawing on board

    // load images
    birdImg = new Image();
    topPipeImg = new Image();
    bottomPipeImg = new Image();

    birdImg.src = "./flappybird.png";
    topPipeImg.src = "./toppipe.png";
    bottomPipeImg.src = "./bottompipe.png";

    // wait until all images are loaded
    Promise.all([loadImage(birdImg), loadImage(topPipeImg), loadImage(bottomPipeImg)]).then(() => {
        requestAnimationFrame(update);
        setInterval(placePipes, 1800); // 1.8s
        document.addEventListener("keydown", moveBird);
        document.addEventListener("mousedown", moveBird);
        document.addEventListener("touchstart", moveBird);
    });

    startWeather();
}

function resizeCanvas() {
    board.width = boardWidth;
    board.height = boardHeight;
    board.style.width = `${boardWidth}px`;
    board.style.height = `${boardHeight}px`;
}

function loadImage(image) {
    return new Promise((resolve) => {
        image.onload = resolve;
    });
}

function update() {
    requestAnimationFrame(update);
    if (gameOver) {
        if (!hasGameOverSoundPlayed) {
            gameOverSound.play();
            hasGameOverSoundPlayed = true;
        }
        context.fillText("GAME OVER", 5, 135);
        return;
    }

    context.clearRect(0, 0, board.width, board.height);

    applyWeatherEffects();

    // bird
    velocityY += gravity;
    bird.y = Math.max(bird.y + velocityY, 0);
    context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);

    if (bird.y > board.height) {
        gameOver = true;
    }

    // pipes
    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX;
        context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (!pipe.passed && bird.x > pipe.x + pipe.width) {
            score += 0.5; // 2 pipes. so 0.5 for bottom and 0.5 for top.
            pipe.passed = true;
        }

        if (detectCollision(bird, pipe)) {
            gameOver = true;
        }
    }

    // clear passed pipes
    while (pipeArray.length > 0 && pipeArray[0].x < -pipeWidth) {
        pipeArray.shift(); // removes first element from the array
    }

    // score
    context.fillStyle = "white";
    context.font = "45px sans-serif";
    context.fillText(score, 5, 45);
    context.fillText("High Score: " + highScore , 5, 85);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("highScore", highScore);
    }
}

function placePipes() {
    if (gameOver) {
        return;
    }

    let randomPipeY = pipeY - pipeHeight / 4 - Math.random() * (pipeHeight / 2);
    let openingSpace = board.height / 4;

    let topPipe = {
        img: topPipeImg,
        x: pipeX,
        y: randomPipeY,
        width: pipeWidth,
        height: pipeHeight,
        passed: false
    }

    pipeArray.push(topPipe);

    let bottomPipe = {
        img: bottomPipeImg,
        x: pipeX,
        y: randomPipeY + pipeHeight + openingSpace,
        width: pipeWidth,
        height: pipeHeight,
        passed: false
    }

    pipeArray.push(bottomPipe);
}

function moveBird(e) {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyX" || e.type === "mousedown" || e.type === "touchstart") {
        // jump
        velocityY = -3;

        // reset game
        if (gameOver) {
            bird.y = birdY;
            pipeArray = [];
            score = 0;
            gameOver = false;
            hasGameOverSoundPlayed = false;
        }
    }
}

function detectCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function startWeather() {
    weatherInterval = setInterval(() => {
        let weatherOptions = ["none", "rain", "snow", "wind", "strongWind"];
        weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
    }, 4000); // change weather every 5 seconds
}

function applyWeatherEffects() {
    switch (weather) {
        case "rain":
            // draw rain effect
            context.fillStyle = "rgba(0, 0, 255, 0.2)";
            context.fillRect(0, 0, board.width, board.height);
            break;
        case "snow":
            // draw snow effect
            context.fillStyle = "rgba(255, 255, 255, 0.2)";
            context.fillRect(0, 0, board.width, board.height);
            break;
        case "wind":
            // apply wind effect by changing bird's velocityX
            velocityX = -1.8;
            break;
        case "strongWind":
            // apply strong wind effect by changing bird's velocityX
            velocityX = -2.5;
            break;
        default:
            velocityX = -1;
            break;
    }
}