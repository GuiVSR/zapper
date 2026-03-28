const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/frontend/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/public'),
        filename: 'bundle.js',
        publicPath: '/'
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html'
        })
    ],
    devServer: {
        client: { overlay: false },
        static: {
            directory: path.join(__dirname, 'dist/public'),
        },
        port: 3001,
        hot: true,
        proxy: [
            {
                context: ['/socket.io', '/api'],  // Add '/api' to the proxy context
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true,
                secure: false
            }
        ]
    }
};