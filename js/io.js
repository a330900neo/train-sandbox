import { GameState } from './state.js';

export function initIO() {
    document.getElementById('btn-export').addEventListener('click', () => {
        const data = JSON.stringify({ tracks: GameState.tracks, platforms: GameState.platforms });
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "train_layout.json";
        a.click();
    });

    document.getElementById('btn-import').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = event => {
                const parsed = JSON.parse(event.target.result);
                GameState.tracks = parsed.tracks || [];
                GameState.platforms = parsed.platforms || [];
            };
            reader.readAsText(file);
        };
        input.click();
    });
}
