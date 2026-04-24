export const state = {
    tracks: [],
    platforms: [],
    currentTool: 'pan', // pan, track, platform, select, multiselect
    selection: [],
    
    save() {
        const data = { tracks: this.tracks, platforms: this.platforms };
        localStorage.setItem('trainBuilderData', JSON.stringify(data));
        alert('Saved to local storage!');
    },
    
    load() {
        const data = localStorage.getItem('trainBuilderData');
        if (data) {
            const parsed = JSON.parse(data);
            this.tracks = parsed.tracks || [];
            this.platforms = parsed.platforms || [];
            alert('Loaded successfully!');
        } else {
            alert('No save data found.');
        }
    }
};
