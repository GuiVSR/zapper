declare module '*.css';
declare module '*.module.css';

declare module '*.css' {
    const content: any;
    export default content;
}