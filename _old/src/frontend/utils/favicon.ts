import { FAVICON_SIZE, FAVICON_COLOR } from '../../constants';

export function updateFavicon(count: number): void {
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_SIZE;
    canvas.height = FAVICON_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(FAVICON_SIZE / 2, FAVICON_SIZE / 2, FAVICON_SIZE / 2 - 1, 0, 2 * Math.PI);
    ctx.fillStyle = FAVICON_COLOR;
    ctx.fill();
    ctx.fillStyle = 'white';
    if (count > 0) {
        ctx.font = `bold ${count > 9 ? '14' : '18'}px sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 99 ? '99+' : String(count), FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    } else {
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Z', FAVICON_SIZE / 2, FAVICON_SIZE / 2 + 1);
    }
    const link = document.getElementById('favicon') as HTMLLinkElement;
    if (link) link.href = canvas.toDataURL('image/png');
}
